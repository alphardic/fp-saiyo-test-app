import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "edge";

interface SubmitBody {
  answers: { questionId: string; answer: string }[];
}

/**
 * POST /api/exam/[token]/submit
 * 候補者の回答を保存する。
 * 選択式はここで自動採点し、記述式はAI採点未実施の状態で保存する
 * (AI採点は別途バッチ処理 or strategist-agent方式の採点フローで行う想定。TODO)。
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  const supabase = getSupabaseServerClient();
  const { token } = params;
  const body = (await req.json()) as SubmitBody;

  const { data: candidate } = await supabase
    .from("candidates")
    .select("id")
    .eq("invite_token", token)
    .single();

  if (!candidate) {
    return NextResponse.json(
      { error: "無効な受験リンクです。" },
      { status: 404 }
    );
  }

  const { data: session } = await supabase
    .from("exam_sessions")
    .select("id, status, question_ids")
    .eq("candidate_id", candidate.id)
    .single();

  if (!session) {
    return NextResponse.json(
      { error: "受験セッションが見つかりません。" },
      { status: 404 }
    );
  }
  if (session.status === "submitted" || session.status === "graded") {
    return NextResponse.json(
      { error: "既に提出済みです。" },
      { status: 409 }
    );
  }

  const { data: questions } = await supabase
    .from("questions")
    .select("id, type, answer")
    .in("id", session.question_ids);

  const questionMap = new Map((questions ?? []).map((q) => [q.id, q]));

  const rows = body.answers.map(({ questionId, answer }) => {
    const q = questionMap.get(questionId);
    const isSelectType = q?.type === "選択式";
    return {
      session_id: session.id,
      question_id: questionId,
      candidate_answer: answer,
      // 選択式は正解記号との一致で自動採点。記述式はnull(後でAI採点)。
      is_correct: isSelectType ? answer === q?.answer : null,
      ai_score: null,
      ai_grading_notes: null,
    };
  });

  const { error: insertError } = await supabase
    .from("answers")
    .upsert(rows, { onConflict: "session_id,question_id" });

  if (insertError) {
    return NextResponse.json(
      { error: "回答の保存に失敗しました。" },
      { status: 500 }
    );
  }

  await supabase
    .from("exam_sessions")
    .update({ status: "submitted", submitted_at: new Date().toISOString() })
    .eq("id", session.id);

  // TODO: ここで記述式回答のAI採点ジョブ、および管理者向けレポート(reportsテーブル)
  // の生成をキックする処理を追加する(strategist-agent方式の採点版として別途設計)。

  return NextResponse.json({ ok: true });
}
