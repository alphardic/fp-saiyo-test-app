import { SupabaseClient } from "@supabase/supabase-js";
import { FIELDS } from "@/lib/types";

export interface QuestionBreakdown {
  field: string;
  type: string;
  question: string;
  candidateAnswer: string | null;
  isCorrect: boolean | null;
  aiScore: number | null;
  aiNotes: string | null;
}

interface AnswerRow {
  question_id: string;
  candidate_answer: string | null;
  is_correct: boolean | null;
  ai_score: number | null;
  ai_grading_notes: string | null;
  questions: {
    field: string;
    type: string;
    question: string;
    choices: string[] | null;
  } | null;
}

/**
 * 1つの受験セッションについて、分野別スコア(0〜100点、FIELDS各分野)と
 * 設問別の回答内訳を集計する。
 * report(個別レポート)・compare(候補者比較)の両方から共通で使う。
 */
export async function computeSessionFieldScores(
  supabase: SupabaseClient,
  sessionId: string
): Promise<{ fieldScores: Record<string, number>; questionBreakdown: QuestionBreakdown[] }> {
  const { data: answers } = await supabase
    .from("answers")
    .select(
      "question_id, candidate_answer, is_correct, ai_score, ai_grading_notes, questions(field, type, question, choices)"
    )
    .eq("session_id", sessionId);

  const typedAnswers = (answers ?? []) as unknown as AnswerRow[];

  const fieldTotals = new Map<string, { sum: number; count: number }>();
  for (const a of typedAnswers) {
    const field = a.questions?.field;
    if (!field) continue;
    const score =
      a.questions?.type === "選択式" ? (a.is_correct ? 100 : 0) : a.ai_score ?? 0;
    const cur = fieldTotals.get(field) ?? { sum: 0, count: 0 };
    cur.sum += score;
    cur.count += 1;
    fieldTotals.set(field, cur);
  }

  const fieldScores: Record<string, number> = {};
  for (const field of FIELDS) {
    const t = fieldTotals.get(field);
    fieldScores[field] = t ? Math.round(t.sum / t.count) : 0;
  }

  const questionBreakdown: QuestionBreakdown[] = typedAnswers.map((a) => ({
    field: a.questions?.field ?? "-",
    type: a.questions?.type ?? "-",
    question: a.questions?.question ?? "",
    candidateAnswer: a.candidate_answer,
    isCorrect: a.is_correct,
    aiScore: a.ai_score,
    aiNotes: a.ai_grading_notes,
  }));

  return { fieldScores, questionBreakdown };
}

/**
 * 分野別スコアの単純平均(候補者の総合点)を計算する。
 */
export function overallAverage(fieldScores: Record<string, number>): number {
  const values = FIELDS.map((f) => fieldScores[f] ?? 0);
  if (values.length === 0) return 0;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}