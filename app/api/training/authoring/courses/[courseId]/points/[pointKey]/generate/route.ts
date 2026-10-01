import { NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  AuthoringError,
  handleAuthoring,
  loadActiveRules,
  loadCourseForActor,
  loadQuestions,
  resolveActor,
  toCourseContext,
  toDraft,
} from "@/lib/trainingAuthoring";
import { generateQuestionsForPoint } from "@/lib/trainingAuthoringAI";

/**
 * POST /api/training/authoring/courses/[courseId]/points/[pointKey]/generate
 * 1つの知識ポイントの問題(パターン違い)をAIに作らせる。既存の問題があれば作り直す。
 * 画面側は知識ポイントごとに順番にこのAPIを呼び、進み具合を表示する。
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { courseId: string; pointKey: string } }
) {
  return handleAuthoring(async () => {
    const actor = await resolveActor(req);
    const course = await loadCourseForActor(actor, params.courseId, { edit: true });
    const pointIndex = course.outline.findIndex((p) => p.key === params.pointKey);
    if (pointIndex < 0) throw new AuthoringError("知識ポイントが見つかりません。", 404);
    const point = course.outline[pointIndex];

    const body = (await req.json().catch(() => ({}))) as { instruction?: string };
    const questions = await loadQuestions(course.id);

    const drafts = await generateQuestionsForPoint({
      course: toCourseContext(course),
      rules: await loadActiveRules(),
      outline: course.outline,
      point,
      variants: course.variants_per_point,
      otherQuestions: questions
        .filter((q) => q.group_key !== point.key)
        .map((q) => ({ label: q.group_label, question: toDraft(q) })),
      instruction: body.instruction?.trim() || undefined,
    });

    const supabase = getSupabaseServerClient();
    const oldIds = questions.filter((q) => q.group_key === point.key).map((q) => q.id);

    const { error } = await supabase.from("training_questions").insert(
      drafts.map((d) => ({
        course_id: course.id,
        group_key: point.key,
        group_label: point.label,
        sort_order: pointIndex + 1,
        question: d.question,
        choices: d.choices,
        answer: d.answer,
        explanation: d.explanation,
      }))
    );
    if (error) throw new AuthoringError("問題の保存に失敗しました: " + error.message, 500);

    if (oldIds.length > 0) {
      await supabase.from("training_questions").delete().in("id", oldIds);
    }
    return { ok: true, count: drafts.length };
  });
}
