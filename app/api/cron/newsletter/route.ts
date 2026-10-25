import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  APP_URL,
  NEWSLETTER_REVIEWER,
  NewsletterError,
  createNewsletterDraft,
  newsletterBodyToHtml,
} from "@/lib/newsletter";
import { sendNewsletterReviewRequest } from "@/lib/notify";

/**
 * POST /api/cron/newsletter
 * 定期実行(custom-worker.js の scheduled)から呼ばれ、お知らせメールの下書きを作って確認者に知らせる。
 * 全社員への送信はしない(送信は確認者が管理画面で行う)。
 * Worker 内部からの呼び出しだけを受け付けるため、サーバー専用の秘密値をヘッダーで照合する。
 */
export async function POST(req: NextRequest) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || req.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ error: "許可されていません。" }, { status: 401 });
  }

  const supabase = getSupabaseServerClient();
  try {
    const draft = await createNewsletterDraft(supabase, "schedule");
    await sendNewsletterReviewRequest({
      to: NEWSLETTER_REVIEWER,
      subject: draft.subject,
      bodyHtml: newsletterBodyToHtml(draft.body),
      reviewUrl: `${APP_URL}/admin/newsletter`,
      reminder: draft.reused,
    });
    return NextResponse.json({ success: true, id: draft.id, reused: draft.reused });
  } catch (e) {
    const message = e instanceof NewsletterError ? e.message : "下書きの作成に失敗しました。";
    console.error("お知らせメールの下書き作成に失敗しました:", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
