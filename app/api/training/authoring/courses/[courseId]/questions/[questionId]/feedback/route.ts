import { NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  AuthoringError,
  handleAuthoring,
  loadActiveRules,
  loadCourseForActor,
  loadQuestions,
  resolveActor,
  saveLesson,
  toCourseContext,
  toDraft,
} from "@/lib/trainingAuthoring";
import { reviseWithComment } from "@/lib/trainingAuthoringAI";

/**
 * POST /api/training/authoring/courses/[courseId]/questions/[questionId]/feedback
 * 問題への指摘コメントを受け取り、AIが問題を修正する。
 * あわせて指摘から一般化できる作問ルールを抽出し、今後すべてのテスト作成に反映する。
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { courseId: string; questionId: string } }
) {
  return handleAuthoring(async () => {
    const actor = await resolveActor(req);
    const course = await loadCourseForActor(actor, params.courseId, { edit: true });
    const body = (await req.json().catch(() => ({}))) as { comment?: string; applyToGroup?: boolean };
    const comment = body.comment?.trim();
    if (!comment) throw new AuthoringError("指摘内容を入力してください。", 400);

    const questions = await loadQuestions(course.id);
    const target = questions.find((q) => q.id === params.questionId);
    if (!target) throw new AuthoringError("問題が見つかりません。", 404);
    const siblings = questions.filter((q) => q.group_key === target.group_key && q.id !== target.id);

    const { revisions, lesson } = await reviseWithComment({
      course: toCourseContext(course),
      rules: await loadActiveRules(),
      pointLabel: target.group_label,
      target: { id: target.id, question: toDraft(target) },
      siblings: siblings.map((s) => ({ id: s.id, question: toDraft(s) })),
      comment,
      applyToGroup: body.applyToGroup ?? false,
    });

    const supabase = getSupabaseServerClient();
    await Promise.all(
      revisions.map((r) =>
        supabase
          .from("training_questions")
          .update({
            question: r.question.question,
            choices: r.question.choices,
            answer: r.question.answer,
            explanation: r.question.explanation,
          })
          .eq("id", r.id)
          .eq("course_id", course.id)
      )
    );

    const learnedRuleId = await saveLesson(lesson, actor, course.id);
    const targetRevision = revisions.find((r) => r.id === target.id);

    await supabase.from("training_question_feedback").insert({
      course_id: course.id,
      question_id: target.id,
      kind: "comment",
      comment,
      before: toDraft(target),
      after: targetRevision?.question ?? null,
      learned_rule_id: learnedRuleId,
      created_by: actor.name,
    });

    return { ok: true, revisedCount: revisions.length, learnedRule: lesson || null };
  });
}
