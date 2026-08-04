import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/adminAuth";

/**
 * POST /api/admin/employees/[id]/logic-invite
 * 社員向けにロジカルシンキング適性テストの招待を発行する。
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const supabase = getSupabaseServerClient();

  const { data: employee, error: employeeError } = await supabase
    .from("employees")
    .select("id, name, email")
    .eq("id", params.id)
    .single();

  if (employeeError || !employee) {
    return NextResponse.json({ error: "社員が見つかりません。" }, { status: 404 });
  }

  const { data: logicCandidate, error: logicError } = await supabase
    .from("logic_candidates")
    .insert({
      name: employee.name,
      email: employee.email,
      invite_token: crypto.randomUUID(),
      employee_id: employee.id,
      invited_by: authResult.email,
    })
    .select("id, invite_token")
    .single();

  if (logicError || !logicCandidate) {
    return NextResponse.json(
      { error: "招待の発行に失敗しました: " + (logicError?.message ?? "") },
      { status: 500 }
    );
  }

  await supabase
    .from("logic_exam_sessions")
    .insert({ candidate_id: logicCandidate.id, status: "not_started" });

  return NextResponse.json({ logicInviteToken: logicCandidate.invite_token });
}