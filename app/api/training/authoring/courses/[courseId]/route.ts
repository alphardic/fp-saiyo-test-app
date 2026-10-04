import { NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  AuthoringError,
  editableStatuses,
  handleAuthoring,
  loadCourseForActor,
  loadQuestions,
  resolveActor,
} from "@/lib/trainingAuthoring";
import type { OutlinePoint } from "@/lib/trainingAuthoringAI";

type Params = { params: { courseId: string } };

/**
 * GET /api/training/authoring/courses/[courseId]
 * 作問画面の表示に必要なもの(テスト情報・知識ポイント・問題・指摘履歴)をまとめて返す。
 */
export async function GET(req: NextRequest, { params }: Params) {
  return handleAuthoring(async () => {
    const actor = await resolveActor(req);
    const course = await loadCourseForActor(actor, params.courseId, { edit: false });
    const supabase = getSupabaseServerClient();

    const [questions, { data: author }, { data: feedback }, { data: reviewerRows }] = await Promise.all([
      loadQuestions(course.id),
      course.author_employee_id
        ? supabase.from("employees").select("name").eq("id", course.author_employee_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from("training_question_feedback")
        .select("id, question_id, kind, comment, created_by, created_at, learned_rule_id")
        .eq("course_id", course.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("training_course_reviewers")
        .select("id, reviewer_employee_id, status, comment, requested_at, done_at")
        .eq("course_id", course.id)
        .order("requested_at", { ascending: true }),
    ]);

    const reviewerIds = (reviewerRows ?? []).map((r) => r.reviewer_employee_id);
    const { data: reviewerEmployees } =
      reviewerIds.length > 0
        ? await supabase.from("employees").select("id, name, email").in("id", reviewerIds)
        : { data: [] as { id: string; name: string; email: string | null }[] };

    const { role, ...courseData } = course;
    const canEdit = editableStatuses(role).includes(course.status);
    // 確認者は問題への指摘・手直しだけできる
    const canEditQuestions = canEdit;
    const canEditCourse = canEdit && role !== "reviewer";

    return {
      viewer: role,
      canEdit: canEditCourse,
      canEditQuestions,
      myEmployeeId: actor.kind === "author" ? actor.employeeId : null,
      authorName: author?.name ?? null,
      course: courseData,
      questions,
      feedback: feedback ?? [],
      reviewers: (reviewerRows ?? []).map((r) => {
        const e = (reviewerEmployees ?? []).find((x) => x.id === r.reviewer_employee_id);
        return {
          id: r.id,
          employeeId: r.reviewer_employee_id,
          name: e?.name ?? "(削除された社員)",
          email: e?.email ?? null,
          status: r.status,
          comment: r.comment,
          requestedAt: r.requested_at,
          doneAt: r.done_at,
        };
      }),
      registerPath: course.status === "active" ? `/training/register/${course.id}` : null,
    };
  });
}

/**
 * PATCH /api/training/authoring/courses/[courseId]
 * テスト名・説明・資料ノート・知識ポイントなどを更新する。
 * 知識ポイントから外されたものは、その問題も削除する。
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  return handleAuthoring(async () => {
    const actor = await resolveActor(req);
    const course = await loadCourseForActor(actor, params.courseId, { edit: true });
    const body = (await req.json().catch(() => ({}))) as {
      name?: string;
      description?: string;
      targetAudience?: string;
      sourceNotes?: string;
      outline?: OutlinePoint[];
      variantsPerPoint?: number;
    };

    const update: Record<string, unknown> = {};
    if (body.name !== undefined) {
      if (!body.name.trim()) throw new AuthoringError("テスト名を入力してください。", 400);
      update.name = body.name.trim();
    }
    if (body.description !== undefined) update.description = body.description.trim() || null;
    if (body.targetAudience !== undefined) update.target_audience = body.targetAudience.trim() || null;
    if (body.sourceNotes !== undefined) update.source_notes = body.sourceNotes;
    if (body.variantsPerPoint !== undefined) {
      update.variants_per_point = Math.min(5, Math.max(1, Math.round(body.variantsPerPoint)));
    }

    const supabase = getSupabaseServerClient();

    if (body.outline !== undefined) {
      const outline = body.outline
        .filter((p) => p.label?.trim())
        .map((p) => ({
          key: p.key || "p" + crypto.randomUUID().slice(0, 8),
          label: p.label.trim(),
          summary: (p.summary ?? "").trim(),
        }));
      update.outline = outline;

      const keys = outline.map((p) => p.key);
      const { data: existing } = await supabase
        .from("training_questions")
        .select("id, group_key")
        .eq("course_id", course.id);
      const removedIds = (existing ?? []).filter((q) => !keys.includes(q.group_key)).map((q) => q.id);
      if (removedIds.length > 0) {
        await supabase.from("training_questions").delete().in("id", removedIds);
      }
      // 名前や並び順の変更を、作成済みの問題にも反映する
      await Promise.all(
        outline.map((p, i) =>
          supabase
            .from("training_questions")
            .update({ group_label: p.label, sort_order: i + 1 })
            .eq("course_id", course.id)
            .eq("group_key", p.key)
        )
      );
    }

    if (Object.keys(update).length > 0) {
      const { error } = await supabase.from("training_courses").update(update).eq("id", course.id);
      if (error) throw new AuthoringError("保存に失敗しました: " + error.message, 500);
    }
    return { ok: true };
  });
}

/**
 * DELETE /api/training/authoring/courses/[courseId]
 * 作成中・差し戻し中のテストを削除する(配布中のテストは削除不可)。
 */
export async function DELETE(req: NextRequest, { params }: Params) {
  return handleAuthoring(async () => {
    const actor = await resolveActor(req);
    const course = await loadCourseForActor(actor, params.courseId, { edit: true });
    const supabase = getSupabaseServerClient();
    const { error } = await supabase.from("training_courses").delete().eq("id", course.id);
    if (error) throw new AuthoringError("削除に失敗しました: " + error.message, 500);
    return { ok: true };
  });
}
