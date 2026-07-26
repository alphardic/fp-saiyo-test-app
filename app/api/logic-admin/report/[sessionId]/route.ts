import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/adminAuth";

export async function GET(
  req: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  const authResult = await requireAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const supabase = getSupabaseServerClient();

  const { data: session, error: sessionError } = await supabase
    .from("logic_exam_sessions")
    .select("id, candidate_id, status, started_at, completed_at")
    .eq("id", params.sessionId)
    .maybeSingle();

  if (sessionError || !session) {
    return NextResponse.json({ error: "セッションが見つかりません。" }, { status: 404 });
  }

  const { data: candidate } = await supabase
    .from("logic_candidates")
    .select("id, name, email")
    .eq("id", session.candidate_id)
    .maybeSingle();

  const { data: report } = await supabase
    .from("logic_reports")
    .select("logic_score, hearing_score, self_persuasion_score, overall_summary")
    .eq("session_id", session.id)
    .maybeSingle();

  const { data: answers } = await supabase
    .from("logic_answers")
    .select("question_id, choice_answer, text_answer, ai_score, ai_notes")
    .eq("session_id", session.id);

  const { data: questions } = await supabase
    .from("logic_questions")
    .select("id, section, type, sort_order, prompt, choices, correct_choice")
    .order("sort_order", { ascending: true });

  const answerMap = new Map((answers ?? []).map((a) => [a.question_id, a]));

  const items = (questions ?? []).map((q) => ({
    ...q,
    answer: answerMap.get(q.id) ?? null,
  }));

  return NextResponse.json({
    candidate,
    session,
    report,
    items,
  });
}
