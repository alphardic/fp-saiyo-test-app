import { NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  AuthoringError,
  handleAuthoring,
  loadCourseForActor,
  resolveActor,
} from "@/lib/trainingAuthoring";
import { sendAuthoringDecisionNotification } from "@/lib/notify";

/**
 * POST /api/training/authoring/courses/[courseId]/decision
 * 管理者が承認申請中のテストを承認(受験に使える状態にする)または差し戻す。
 */
export async function POST(req: NextRequest, { params }: { params: { courseId: string } }) {
  return handleAuthoring(async () => {
    const actor = await resolveActor(req);
    if (actor.kind !== "admin") {
      throw new AuthoringError("承認・差し戻しは管理者のみ行えます。", 403);
    }
    const course = await loadCourseForActor(actor, params.courseId, { edit: false });
    if (course.status !== "pending") {
      throw new AuthoringError("承認申請中のテストではありません。", 409);
    }

    const body = (await req.json().catch(() => ({}))) as {
      decision?: "approve" | "reject";
      comment?: string;
    };
    const comment = body.comment?.trim() ?? "";
    if (body.decision !== "approve" && body.decision !== "reject") {
      throw new AuthoringError("承認か差し戻しを選んでください。", 400);
    }
    if (body.decision === "reject" && !comment) {
      throw new AuthoringError("差し戻す理由を入力してください。", 400);
    }
    const approved = body.decision === "approve";

    const supabase = getSupabaseServerClient();
    const { error } = await supabase
      .from("training_courses")
      .update({
        status: approved ? "active" : "rejected",
        review_comment: comment || null,
        decided_at: new Date().toISOString(),
        decided_by: actor.name,
      })
      .eq("id", course.id);
    if (error) throw new AuthoringError("更新に失敗しました: " + error.message, 500);

    if (course.author_employee_id) {
      const [{ data: author }, { data: authorLink }] = await Promise.all([
        supabase.from("employees").select("name, email").eq("id", course.author_employee_id).maybeSingle(),
        supabase
          .from("training_authors")
          .select("author_token")
          .eq("employee_id", course.author_employee_id)
          .maybeSingle(),
      ]);
      if (author?.email && authorLink) {
        await sendAuthoringDecisionNotification({
          to: author.email,
          authorName: author.name,
          courseName: course.name,
          approved,
          comment,
          editorUrl: `${req.nextUrl.origin}/training/author/${authorLink.author_token}/course/${course.id}`,
        });
      }
    }
    return { ok: true };
  });
}
