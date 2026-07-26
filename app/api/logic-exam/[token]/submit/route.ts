import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { gradeDescriptiveAnswer, generateOverallSummary } from "@/lib/aiGrading";

interface SubmitAnswer {
  questionId: string;
  choiceAnswer?: string;
  textAnswer?: string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  const supabase = getSupabaseServerClient();

  const { data: candidate, error: candidateError } = await supabase
    .from("logic_candidates")
    .select("id, name, email")
    .eq("invite_token", params.token)
    .maybeSingle();

  if (candidateError || !candidate) {
    return NextResponse.json({ error: "無効なリンクです。" }, { status: 404 });
  }

  const { data: session, error: sessionError } = await supabase
    .from("logic_exam_sessions")
    .select("id, status")
    .eq("candidate_id", candidate.id)
    .maybeSingle();

  if (sessionError || !session) {
    return NextResponse.json({ error: "受験情報が見つかりません。" }, { status: 404 });
  }

  if (session.status === "completed") {
    return NextResponse.json({ error: "このテストは既に提出済みです。" }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as { answers?: SubmitAnswer[] };
  const answers = body.answers ?? [];

  const { data: questions, error: questionsError } = await supabase
    .from("logic_questions")
    .select("id, section, type, prompt, correct_choice, model_answer, grading_criteria")
    .eq("status", "active");

  if (questionsError || !questions) {
    return NextResponse.json({ error: "設問の取得に失敗しました。" }, { status: 400 });
  }

  const questionMap = new Map(questions.map((q) => [q.id, q]));

  let correctCount = 0;
  let choiceCount = 0;
  const hearingScores: number[] = [];
  const persuasionScores: number[] = [];

  for (const ans of answers) {
    const question = questionMap.get(ans.questionId);
    if (!question) continue;

    if (question.type === "choice") {
      choiceCount += 1;
      const isCorrect = ans.choiceAnswer === question.correct_choice;
      if (isCorrect) correctCount += 1;

      await supabase.from("logic_answers").upsert(
        {
          session_id: session.id,
          question_id: question.id,
          choice_answer: ans.choiceAnswer ?? null,
        },
        { onConflict: "session_id,question_id" }
      );
    } else {
      const grade = await gradeDescriptiveAnswer({
        question: question.prompt,
        modelAnswer: question.model_answer ?? "",
        gradingCriteria: question.grading_criteria ?? "",
        candidateAnswer: ans.textAnswer ?? "",
      });

      await supabase.from("logic_answers").upsert(
        {
          session_id: session.id,
          question_id: question.id,
          text_answer: ans.textAnswer ?? null,
          ai_score: grade.score,
          ai_notes: grade.notes,
        },
        { onConflict: "session_id,question_id" }
      );

      if (question.section === "B") {
        hearingScores.push(grade.score);
      } else if (question.section === "C") {
        persuasionScores.push(grade.score);
      }
    }
  }

  const logicScore = choiceCount > 0 ? Math.round((correctCount / choiceCount) * 100) : 0;
  const hearingScore =
    hearingScores.length > 0
      ? Math.round(hearingScores.reduce((a, b) => a + b, 0) / hearingScores.length)
      : 0;
  const selfPersuasionScore =
    persuasionScores.length > 0
      ? Math.round(persuasionScores.reduce((a, b) => a + b, 0) / persuasionScores.length)
      : 0;

  let overallSummary = "";
  try {
    overallSummary = await generateOverallSummary({
      candidateName: candidate.name,
      fieldScores: {
        論理的思考力: logicScore,
        ヒヤリング力: hearingScore,
        自己洗脳力: selfPersuasionScore,
      },
    });
  } catch {
    overallSummary = "";
  }

  await supabase.from("logic_reports").upsert(
    {
      session_id: session.id,
      logic_score: logicScore,
      hearing_score: hearingScore,
      self_persuasion_score: selfPersuasionScore,
      overall_summary: overallSummary,
    },
    { onConflict: "session_id" }
  );

  await supabase
    .from("logic_exam_sessions")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", session.id);

  return NextResponse.json({ success: true });
}
