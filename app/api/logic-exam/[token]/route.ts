import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(
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
    .select("id, status, started_at, completed_at")
    .eq("candidate_id", candidate.id)
    .maybeSingle();

  if (sessionError || !session) {
    return NextResponse.json({ error: "受験情報が見つかりません。" }, { status: 404 });
  }

  if (session.status === "completed") {
    return NextResponse.json(
      { error: "このテストは既に提出済みです。", completed: true },
      { status: 400 }
    );
  }

  if (session.status === "not_started") {
    await supabase
      .from("logic_exam_sessions")
      .update({ status: "in_progress", started_at: new Date().toISOString() })
      .eq("id", session.id);
  }

  const { data: questions, error: questionsError } = await supabase
    .from("logic_questions")
    .select("id, section, type, sort_order, prompt, choices")
    .eq("status", "active")
    .order("sort_order", { ascending: true });

  if (questionsError) {
    return NextResponse.json({ error: questionsError.message }, { status: 400 });
  }

  const { data: existingAnswers } = await supabase
    .from("logic_answers")
    .select("question_id, choice_answer, text_answer")
    .eq("session_id", session.id);

  return NextResponse.json({
    candidateName: candidate.name,
    sessionId: session.id,
    questions: questions ?? [],
    existingAnswers: existingAnswers ?? [],
  });
}