import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/lib/adminAuth";
import { NewsletterError, saveNewsletterEdit } from "@/lib/newsletter";

/**
 * PUT /api/admin/newsletters/[id]
 * 未送信の下書きの件名・本文を手で直す(最高権限者のみ)。body: { subject, body }
 * 内容が変わるので、承認済みなら承認を取り消す。
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

  try {
    await saveNewsletterEdit(getSupabaseServerClient(), params.id, subject, text);
    return NextResponse.json({ success: true });
  } catch (e) {
    const message = e instanceof NewsletterError ? e.message : "保存に失敗しました。";
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
