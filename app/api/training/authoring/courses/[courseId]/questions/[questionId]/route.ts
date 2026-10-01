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
  toDraft,
} from "@/lib/trainingAuthoring";
import { extractLessonFromEdit, type QuestionDraft } from "@/lib/trainingAuthoringAI";

type Params = { params: { courseId: string; questionId: string } };

/**
 * PATCH /api/training/authoring/courses/[courseId]/questions/[questionId]
 * 問題を手で書き換える。変更前後の差分から作問ルールを学習する。
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  return handleAuthoring(async () => {
    const actor = await resolveActor(req);
    const course = await loadCourseForActor(actor, params.courseId, { edit: true });
    const target = (await loadQuestions(course.id)).find((q) => q.id === params.questionId);
    if (!target) throw new AuthoringError("問題が見つかりません。", 404);

    const body = (await req.json().catch(() => ({}))) as Partial<QuestionDraft> & { reason?: string };
    const after: QuestionDraft = {
      question: body.question?.trim() ?? "",
      choices: (body.choices ?? []).map((c) => c.trim()),
      answer: body.answer ?? "",
      explanation: body.explanation?.trim() ?? "",
    };
    if (!after.question || after.choices.length !== 4 || after.choices.some((c) => !c)) {
      throw new AuthoringError("問題文と4つの選択肢を入力してください。", 400);
    }
    if (!["A", "B", "C", "D"].includes(after.answer)) {
      throw new AuthoringError("正解を選んでください。", 400);
    }

    const before = toDraft(target);
    const supabase = getSupabaseServerClient();
    const { error } = await supabase
      .from("training_questions")
      .update({
        question: after.question,
        choices: after.choices,
        answer: after.answer,
        explanation: after.explanation,
      })
      .eq("id", target.id);
    if (error) throw new AuthoringError("保存に失敗しました: " + error.message, 500);

    const reason = body.reason?.trim() ?? "";
    let learnedRule: string | null = null;
    let learnedRuleId: string | null = null;
    try {
      learnedRule = await extractLessonFromEdit({ rules: await loadActiveRules(), before, after, reason });
      learnedRuleId = await saveLesson(learnedRule, actor, course.id);
    } catch (e) {
      // 学習に失敗しても、書き換え自体は保存済みなので成功扱いにする
      console.error("手修正からの学習に失敗しました:", e);
    }

    await supabase.from("training_question_feedback").insert({
      course_id: course.id,
      question_id: target.id,
      kind: "manual_edit",
      comment: reason || null,
      before,
      after,
      learned_rule_id: learnedRuleId,
      created_by: actor.name,
    });

    return { ok: true, learnedRule: learnedRule || null };
  });
}

/**
 * DELETE /api/training/authoring/courses/[courseId]/questions/[questionId]
 */
export async function DELETE(req: NextRequest, { params }: Params) {
  return handleAuthoring(async () => {
    const actor = await resolveActor(req);
    const course = await loadCourseForActor(actor, params.courseId, { edit: true });
    const supabase = getSupabaseServerClient();
    const { error } = await supabase
      .from("training_questions")
      .delete()
      .eq("id", params.questionId)
      .eq("course_id", course.id);
    if (error) throw new AuthoringError("削除に失敗しました: " + error.message, 500);
    return { ok: true };
  });
}
