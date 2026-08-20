import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/adminAuth";

/**
 * POST /api/admin/employees/[id]/team
 * 社員をチームに配属する(teamId: null で配属解除)。
 * isLeader: true の場合、同じチームの他メンバーのリーダーフラグは解除する。
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const body = (await req.json()) as { teamId?: string | null; isLeader?: boolean };
  const teamId = body.teamId || null;
  const isLeader = teamId ? !!body.isLeader : false;

  const supabase = getSupabaseServerClient();

  const { data: employee, error: employeeError } = await supabase
    .from("employees")
    .select("id")
    .eq("id", params.id)
    .single();

  if (employeeError || !employee) {
    return NextResponse.json({ error: "社員が見つかりません。" }, { status: 404 });
  }

  if (teamId) {
    const { data: team, error: teamError } = await supabase
      .from("teams")
      .select("id")
      .eq("id", teamId)
      .single();

    if (teamError || !team) {
      return NextResponse.json({ error: "チームが見つかりません。" }, { status: 404 });
    }

    if (isLeader) {
      await supabase
        .from("employees")
        .update({ is_team_leader: false })
        .eq("team_id", teamId)
        .neq("id", params.id);
    }
  }

  const { data, error } = await supabase
    .from("employees")
    .update({ team_id: teamId, is_team_leader: isLeader })
    .eq("id", params.id)
    .select("id, team_id, is_team_leader")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "配属の更新に失敗しました: " + (error?.message ?? "") },
      { status: 500 }
    );
  }

  return NextResponse.json({ employee: data });
}
