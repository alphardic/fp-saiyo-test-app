import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/lib/adminAuth";

/**
 * POST /api/admin/newsletters/[id]/discard
 * この号を送らずに取りやめる(最高権限者のみ)。同じ号は定期実行で作り直さない(次の号は翌月25日に作る)。
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireSuperAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("newsletters")
    .update({ status: "discarded" })
    .eq("id", params.id)
    .eq("status", "draft")
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "取りやめに失敗しました: " + error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "このメールは送信済みか、取りやめ済みです。" }, { status: 409 });
  }
  return NextResponse.json({ success: true });
}
