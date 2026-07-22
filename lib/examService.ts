import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { QuestionForCandidate } from "@/lib/types";

export class ExamAccessError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const TARGET_QUESTION_COUNT = 20;

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * 承認済み問題プールから、分野(field)ごとに偏りが出ないようバランス良く
 * target件を抽出する。
 *
 * 手順:
 *  1. 分野ごとにグルーピングし、各分野内をシャッフル
 *  2. まず全分野から均等に base = floor(target / 分野数) 件ずつ取る
 *  3. 余り(target - base * 分野数)件は、まだ在庫のある分野からランダムに1件ずつ追加
 *  4. それでも不足する場合(在庫切れ等)は残りの問題から補充
 *  5. 最終的な出題順序もシャッフルする
 */
export function drawBalancedQuestionIds(
  pool: { id: string; field: string }[],
  target: number = TARGET_QUESTION_COUNT
): string[] {
  const byField = new Map<string, string[]>();
  for (const q of pool) {
    const list = byField.get(q.field) ?? [];
    list.push(q.id);
    byField.set(q.field, list);
  }
  for (const [field, ids] of byField) {
    byField.set(field, shuffle(ids));
  }

  const fields = shuffle([...byField.keys()]);
  const fieldCount = fields.length;
  if (fieldCount === 0) return [];

  const base = Math.floor(target / fieldCount);
  const selected: string[] = [];

  // 1. 各分野からbase件ずつ
  for (const field of fields) {
    const ids = byField.get(field)!;
    const take = ids.splice(0, base);
    selected.push(...take);
  }

  // 2. 余り件数を、在庫のある分野からランダムに1件ずつ追加
  let remainder = target - selected.length;
  const fieldsWithStock = shuffle(fields.filter((f) => (byField.get(f)?.length ?? 0) > 0));
  for (const field of fieldsWithStock) {
    if (remainder <= 0) break;
    const ids = byField.get(field)!;
    if (ids.length === 0) continue;
    selected.push(ids.shift()!);
    remainder--;
  }

  // 3. まだ不足していれば(問題数が少ない等)、残りの在庫から補充
  if (remainder > 0) {
    const leftover = shuffle([...byField.values()].flat());
    selected.push(...leftover.slice(0, remainder));
  }

  return shuffle(selected).slice(0, target);
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
    const { data: pool } = await supabase
      .from("questions")
      .select("id, field")
      .eq("status", "approved");

    const questionIds = drawBalancedQuestionIds(pool ?? [], TARGET_QUESTION_COUNT);

    // 同時アクセス(メールのリンクプレビュー等)でセッションが複数作られないよう、
    // candidate_id の一意制約に対してupsertする(既にあれば新規作成せず既存行を返す)。
    const { data: created, error: createError } = await supabase
      .from("exam_sessions")
      .upsert(
        { candidate_id: candidate.id, question_ids: questionIds, status: "not_started" },
        { onConflict: "candidate_id", ignoreDuplicates: true }
      )
      .select("id, status, question_ids")
      .maybeSingle();

    if (createError) {
      throw new ExamAccessError("受験セッションの作成に失敗しました。", 500);
    }

    if (created) {
      session = created;
    } else {
      // ignoreDuplicates時、他リクエストが先に作成済みだと行が返らないため取り直す
      const { data: existing } = await supabase
        .from("exam_sessions")
        .select("id, status, question_ids")
        .eq("candidate_id", candidate.id)
        .single();
      if (!existing) {
        throw new ExamAccessError("受験セッションの作成に失敗しました。", 500);
      }
      session = existing;
    }
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