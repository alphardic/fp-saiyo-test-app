import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/adminAuth";
import { gradeDescriptiveAnswer } from "@/lib/aiGrading";

interface AnswerWithQuestion {
  question_id: string;
  candidate_answer: string | null;
  ai_score: number | null;
  questions: {
    type: string;
    question: string;
    answer: string;
    explanation: string;
  } | null;
}

/**
 * POST /api/admin/sessions/[id]/grade
 * 記述式回答のAI採点が未完了(ai_score が null)の回答だけを対象に再採点する。
 * 提出時のAI採点が一部失敗した場合の再実行用。
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const supabase = getSupabaseServerClient();
  const sessionId = params.id;

  const { data: session } = await supabase
    .from("exam_sessions")
    .select("id")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session) {
    return NextResponse.json(
      { error: "受験セッションが見つかりません。" },
      { status: 404 }
    );
  }

  const { data: answers } = await supabase
    .from("answers")
    .select("question_id, candidate_answer, ai_score, questions(type, question, answer, explanation)")
    .eq("session_id", sessionId);

  const typedAnswers = (answers ?? []) as unknown as AnswerWithQuestion[];

  const ungraded = typedAnswers.filter(
    (a) => a.questions?.type === "記述式" && a.ai_score === null
  );

  const results = await Promise.allSettled(
    ungraded.map(async (a) => {
      const q = a.questions!;
      const result = await gradeDescriptiveAnswer({
        question: q.question,
        modelAnswer: q.answer,
        gradingCriteria: q.explanation,
        candidateAnswer: a.candidate_answer ?? "",
      });
      const { error } = await supabase
        .from("answers")
        .update({ ai_score: result.score, ai_grading_notes: result.notes })
        .eq("session_id", sessionId)
        .eq("question_id", a.question_id);
      if (error) throw error;
    })
  );

  const allGraded = results.every((r) => r.status === "fulfilled");

  await supabase
    .from("exam_sessions")
    .update({ status: allGraded ? "graded" : "submitted" })
    .eq("id", sessionId);

  return NextResponse.json({ ok: true, allGraded });
}