import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/adminAuth";

/**
 * PATCH /api/admin/training/rules/[id]
 * 作問ルールの文言変更・有効/無効の切り替え。
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const body = (await req.json().catch(() => ({}))) as { rule?: string; active?: boolean };
  const update: Record<string, unknown> = {};
  if (body.rule !== undefined) {
    if (!body.rule.trim()) {
      return NextResponse.json({ error: "ルールを入力してください。" }, { status: 400 });
    }
    update.rule = body.rule.trim();
  }
  if (body.active !== undefined) update.active = body.active;

  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("training_authoring_rules").update(update).eq("id", params.id);
  if (error) {
    return NextResponse.json({ error: "更新に失敗しました: " + error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/admin/training/rules/[id]
 */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("training_authoring_rules").delete().eq("id", params.id);
  if (error) {
    return NextResponse.json({ error: "削除に失敗しました: " + error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
