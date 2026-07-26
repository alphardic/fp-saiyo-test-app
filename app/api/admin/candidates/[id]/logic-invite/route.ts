import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/adminAuth";

/**
 * POST /api/admin/candidates/[id]/logic-invite
 * 既存の候補者に対して、ロジカルシンキング適性テストの招待を後から発行する。
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const supabase = getSupabaseServerClient();

  const { data: existing } = await supabase
    .from("logic_candidates")
    .select("id, invite_token")
    .eq("main_candidate_id", params.id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ logicInviteToken: existing.invite_token });
  }

  const { data: candidate, error: candidateError } = await supabase
    .from("candidates")
    .select("id, name, email")
    .eq("id", params.id)
    .maybeSingle();

  if (candidateError || !candidate) {
    return NextResponse.json({ error: "候補者が見つかりません。" }, { status: 404 });
  }

  const { data: logicCandidate, error: logicError } = await supabase
    .from("logic_candidates")
    .insert({
      name: candidate.name,
      email: candidate.email,
      invite_token: crypto.randomUUID(),
      main_candidate_id: candidate.id,
    })
    .select("id, invite_token")
    .single();

  if (logicError || !logicCandidate) {
    return NextResponse.json(
      { error: "発行に失敗しました: " + (logicError?.message ?? "") },
      { status: 400 }
    );
  }

  await supabase
    .from("logic_exam_sessions")
    .insert({ candidate_id: logicCandidate.id, status: "not_started" });

  return NextResponse.json({ logicInviteToken: logicCandidate.invite_token });
}