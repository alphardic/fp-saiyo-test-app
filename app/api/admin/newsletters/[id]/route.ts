import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/lib/adminAuth";

/**
 * PUT /api/admin/newsletters/[id]
 * 未送信の下書きの件名・本文を直す(最高権限者のみ)。body: { subject, body }
 */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireSuperAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const body = (await req.json().catch(() => ({}))) as { subject?: string; body?: string };
  const subject = body.subject?.trim();
  const text = body.body?.trim();
  if (!subject || !text) {
    return NextResponse.json({ error: "件名と本文を入力してください。" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("newsletters")
    .update({ subject, body: text })
    .eq("id", params.id)
    .eq("status", "draft")
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "保存に失敗しました: " + error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "送信済み・取りやめ済みのメールは直せません。" }, { status: 409 });
  }
  return NextResponse.json({ success: true });
}
