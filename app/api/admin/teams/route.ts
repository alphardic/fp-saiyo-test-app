import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/adminAuth";

/**
 * GET /api/admin/teams
 * チーム一覧を返す(メンバーは /api/admin/employees の team_id で紐付ける)。
 */
export async function GET(req: NextRequest) {
  const authResult = await requireAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const supabase = getSupabaseServerClient();

  const { data, error } = await supabase
    .from("teams")
    .select("id, name, department, goal, ai_analysis, ai_analysis_generated_at, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "データの取得に失敗しました。" }, { status: 500 });
  }

  return NextResponse.json({ teams: data ?? [] });
}

/**
 * POST /api/admin/teams
 * チームを新規登録する。
 */
export async function POST(req: NextRequest) {
  const authResult = await requireAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const body = (await req.json()) as {
    name?: string;
    department?: string | null;
    goal?: string | null;
  };

  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "チーム名を入力してください。" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();

  const { data, error } = await supabase
    .from("teams")
    .insert({
      name,
      department: body.department || null,
      goal: body.goal || null,
    })
    .select("id, name, department, goal, ai_analysis, ai_analysis_generated_at, created_at")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "登録に失敗しました: " + (error?.message ?? "") },
      { status: 400 }
    );
  }

  return NextResponse.json({ team: data });
}
