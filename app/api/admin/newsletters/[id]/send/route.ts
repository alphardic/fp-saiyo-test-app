import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/lib/adminAuth";
import { NEWSLETTER_REVIEWER, NEWSLETTER_TO, newsletterBodyToHtml } from "@/lib/newsletter";
import { sendNewsletterEmail } from "@/lib/notify";

/**
 * POST /api/admin/newsletters/[id]/send
 * 確認済みの下書きを全社員のメーリングリストへ送る(最高権限者のみ)。
 * 二重送信を防ぐため、先に status を draft → sent に切り替えてから送り、失敗したら draft に戻す。
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireSuperAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const supabase = getSupabaseServerClient();
  const { data: claimed, error } = await supabase
    .from("newsletters")
    .update({ status: "sent", sent_at: new Date().toISOString(), sent_by: authResult.email })
    .eq("id", params.id)
    .eq("status", "draft")
    .select("id, subject, body")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "送信の準備に失敗しました: " + error.message }, { status: 500 });
  }
  if (!claimed) {
    return NextResponse.json({ error: "このメールは送信済みか、取りやめ済みです。" }, { status: 409 });
  }

  const result = await sendNewsletterEmail({
    to: NEWSLETTER_TO,
    replyTo: NEWSLETTER_REVIEWER,
    subject: claimed.subject,
    html: newsletterBodyToHtml(claimed.body),
  });

  if (!result.ok) {
    await supabase
      .from("newsletters")
      .update({ status: "draft", sent_at: null, sent_by: null })
      .eq("id", params.id);
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
