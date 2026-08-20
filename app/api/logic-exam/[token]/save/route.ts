import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * POST /api/logic-exam/[token]/save
 * 設問1問ごとの回答を随時保存する(採点はせず、最終提出時にまとめて行う)。
 * ブラウザを閉じて戻れなくなっても、次回アクセス時にlogic_answersから復元できるようにする。
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  const supabase = getSupabaseServerClient();

  const { data: candidate } = await supabase
    .from("logic_candidates")
    .select("id")
    .eq("invite_token", params.token)
    .maybeSingle();

  if (!candidate) {
    return NextResponse.json({ error: "無効なリンクです。" }, { status: 404 });
  }

  const { data: session } = await supabase
    .from("logic_exam_sessions")
    .select("id, status")
    .eq("candidate_id", candidate.id)
    .maybeSingle();

  if (!session) {
    return NextResponse.json({ error: "受験情報が見つかりません。" }, { status: 404 });
  }

  if (session.status === "completed") {
    return NextResponse.json({ error: "このテストは既に提出済みです。" }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    questionId?: string;
    choiceAnswer?: string;
    textAnswer?: string;
  };

  if (!body.questionId) {
    return NextResponse.json({ error: "questionIdが必要です。" }, { status: 400 });
  }

  const { error } = await supabase.from("logic_answers").upsert(
    {
      session_id: session.id,
      question_id: body.questionId,
      choice_answer: body.choiceAnswer ?? null,
      text_answer: body.textAnswer ?? null,
    },
    { onConflict: "session_id,question_id" }
  );

  if (error) {
    return NextResponse.json({ error: "保存に失敗しました。" }, { status: 500 });
  }

  return NextResponse.json({ saved: true });
}
