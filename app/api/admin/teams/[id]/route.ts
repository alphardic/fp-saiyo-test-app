import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/adminAuth";

/**
 * PATCH /api/admin/teams/[id]
 * チームの名前・部署・目標を編集する。
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
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
    .update({
      name,
      department: body.department || null,
      goal: body.goal || null,
    })
    .eq("id", params.id)
    .select("id, name, department, goal, ai_analysis, ai_analysis_generated_at, created_at")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "更新に失敗しました: " + (error?.message ?? "") },
      { status: 400 }
    );
  }

  return NextResponse.json({ team: data });
}

/**
 * DELETE /api/admin/teams/[id]
 * チームを削除する(所属していた社員は自動的に未配属に戻る)。
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("teams").delete().eq("id", params.id);

  if (error) {
    return NextResponse.json({ error: "削除に失敗しました: " + error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
