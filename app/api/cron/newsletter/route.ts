import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  DELIVERY_HOUR,
  DRAFT_DAY,
  NewsletterError,
  createNewsletterDraft,
  deliverNewsletter,
  findIssue,
  jstNow,
  lastDayOfMonth,
  notifyReviewer,
  readMeta,
  upcomingIssueMonth,
} from "@/lib/newsletter";

/**
 * POST /api/cron/newsletter
 * 定期実行(custom-worker.js の scheduled、毎時0分)から呼ばれる。日本時間で:
 * - 毎月1日 9時 … 承認済みのその月の号を all_alpha へ配信。未承認なら田中さんに知らせる。
 * - 25日以降  … 翌月号がまだなければ、4人のAIで下書きを作り、田中さんに赤入れを依頼する。
 * - 28日・月末 9時 … 翌月号が未承認なら、田中さんに催促する。
 * Worker 内部からの呼び出しだけを受け付けるため、サーバー専用の秘密値をヘッダーで照合する。
 */
export async function POST(req: NextRequest) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || req.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ error: "許可されていません。" }, { status: 401 });
  }

  const supabase = getSupabaseServerClient();
  const now = jstNow();
  const done: string[] = [];

  try {
    // 配信(承認済みで配信日になったもの)
    if (now.hour === DELIVERY_HOUR) {
      const { data: drafts } = await supabase
        .from("newsletters")
        .select("id, subject, body, stats")
        .eq("status", "draft");
      for (const d of drafts ?? []) {
        const meta = readMeta(d.stats);
        if (meta.approval && meta.approval.scheduledFor <= now.date) {
          const result = await deliverNewsletter(supabase, d.id, "schedule");
          await notifyReviewer(result.ok ? "delivered" : "delivery_failed", d, result.ok ? undefined : result.error);
          done.push(result.ok ? `delivered ${d.id}` : `delivery failed ${d.id}`);
        } else if (now.day === 1 && meta.issueMonth === now.month) {
          await notifyReviewer("not_approved", d);
          done.push(`not approved ${d.id}`);
        }
      }
    }

    // 翌月号の下書き作成と催促
    if (now.day >= DRAFT_DAY) {
      const issueMonth = upcomingIssueMonth();
      const existing = await findIssue(supabase, issueMonth);
      if (!existing) {
        const created = await createNewsletterDraft(supabase, "schedule", issueMonth);
        await notifyReviewer("draft", { ...created, stats: created.meta });
        done.push(`drafted ${created.id}`);
      } else if (
        existing.status === "draft" &&
        !readMeta(existing.stats).approval &&
        now.hour === DELIVERY_HOUR &&
        (now.day === 28 || now.day === lastDayOfMonth(now.month))
      ) {
        await notifyReviewer("reminder", existing);
        done.push(`reminded ${existing.id}`);
      }
    }

    return NextResponse.json({ success: true, done });
  } catch (e) {
    const message = e instanceof NewsletterError ? e.message : "お知らせメールの処理に失敗しました。";
    console.error("お知らせメールの定期処理に失敗しました:", e);
    return NextResponse.json({ error: message, done }, { status: 500 });
  }
}
