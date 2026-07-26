import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/adminAuth";

export async function GET(req: NextRequest) {
  const authResult = await requireAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const supabase = getSupabaseServerClient();

  const { data: candidates, error: candidatesError } = await supabase
    .from("logic_candidates")
    .select("id, name, email, invite_token, created_at")
    .order("created_at", { ascending: false });

  if (candidatesError) {
    return NextResponse.json({ error: candidatesError.message }, { status: 400 });
  }

  const { data: sessions, error: sessionsError } = await supabase
    .from("logic_exam_sessions")
    .select("id, candidate_id, status, started_at, completed_at");

  if (sessionsError) {
    return NextResponse.json({ error: sessionsError.message }, { status: 400 });
  }

  return NextResponse.json({ candidates: candidates ?? [], sessions: sessions ?? [] });
}

export async function POST(req: NextRequest) {
  const authResult = await requireAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    email?: string;
  };

  if (!body.name || !body.email) {
    return NextResponse.json({ error: "氏名とメールアドレスは必須です。" }, { status: 400 });
  }

  const inviteToken = crypto.randomUUID();
  const supabase = getSupabaseServerClient();

  const { data: candidate, error: candidateError } = await supabase
    .from("logic_candidates")
    .insert({ name: body.name, email: body.email, invite_token: inviteToken })
    .select("id, name, email, invite_token, created_at")
    .single();

  if (candidateError || !candidate) {
    return NextResponse.json(
      { error: "候補者の登録に失敗しました: " + (candidateError?.message ?? "") },
      { status: 400 }
    );
  }

  const { error: sessionError } = await supabase
    .from("logic_exam_sessions")
    .insert({ candidate_id: candidate.id, status: "not_started" });

  if (sessionError) {
    return NextResponse.json(
      { error: "受験セッションの作成に失敗しました: " + sessionError.message },
      { status: 400 }
    );
  }

  return NextResponse.json({ candidate });
}