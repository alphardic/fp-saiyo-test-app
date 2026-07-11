import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { QuestionForCandidate } from "@/lib/types";

export class ExamAccessError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/**
 * トークンから候補者を特定し、受験セッション(なければ新規作成)と
 * 出題対象の問題一覧(候補者向け、正解・解説を除いた形)を返す。
 * app/api/exam/[token]/route.ts と app/exam/[token]/page.tsx の両方から利用する共通ロジック。
 */
export async function getExamForToken(token: string) {
  const supabase = getSupabaseServerClient();

  const { data: candidate, error: candidateError } = await supabase
    .from("candidates")
    .select("id, name")
    .eq("invite_token", token)
    .single();

  if (candidateError || !candidate) {
    throw new ExamAccessError("無効な受験リンクです。", 404);
  }

  let { data: session } = await supabase
    .from("exam_sessions")
    .select("id, status, question_ids")
    .eq("candidate_id", candidate.id)
    .maybeSingle();

  if (!session) {
    // TODO: 13分野からバランスよく抽出するロジックに置き換える(現状は承認済み問題からランダム抽出)。
    const { data: pool } = await supabase
      .from("questions")
      .select("id")
      .eq("status", "approved");

    const questionIds = (pool ?? [])
      .map((q) => q.id)
      .sort(() => Math.random() - 0.5)
      .slice(0, 20);

    const { data: created, error: createError } = await supabase
      .from("exam_sessions")
      .insert({ candidate_id: candidate.id, question_ids: questionIds, status: "not_started" })
      .select("id, status, question_ids")
      .single();

    if (createError || !created) {
      throw new ExamAccessError("受験セッションの作成に失敗しました。", 500);
    }
    session = created;
  }

  if (session.status === "submitted" || session.status === "graded") {
    throw new ExamAccessError("この受験は既に提出済みです。", 409);
  }

  const { data: questions } = await supabase
    .from("questions")
    .select("id, field, type, question, choices")
    .in("id", session.question_ids);

  const questionsForCandidate: QuestionForCandidate[] = (questions ?? []).map((q) => ({
    id: q.id,
    field: q.field,
    type: q.type,
    question: q.question,
    choices: q.choices,
  }));

  return {
    candidateName: candidate.name as string,
    sessionId: session.id as string,
    questions: questionsForCandidate,
  };
}
