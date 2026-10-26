import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin, requireSuperAdmin } from "@/lib/adminAuth";
import { NewsletterError, createNewsletterDraft } from "@/lib/newsletter";

/**
 * GET /api/admin/newsletters
 * お知らせメールの一覧(新しい順)。
 */
export async function GET(req: NextRequest) {
  const authResult = await requireAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("newsletters")
    .select("id, status, subject, body, stats, created_by, created_at, sent_at, sent_by")
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    const missingTable = error.message.includes("newsletters");
    return NextResponse.json(
      {
        error: missingTable
          ? "お知らせメールの準備がまだです。supabase/newsletter_migration.sql を SQL Editor で実行してください。"
          : "一覧の取得に失敗しました: " + error.message,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ newsletters: data ?? [], role: authResult.role });
}

/**
 * POST /api/admin/newsletters
 * 定期実行を待たずに、今すぐ4人のAIに次の号の下書きを作らせる(最高権限者のみ)。
 * 同じ号の確認待ちの下書きがあれば、新しい下書きに置き換える。
 */
export async function POST(req: NextRequest) {
  const authResult = await requireSuperAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const supabase = getSupabaseServerClient();
  try {
    const draft = await createNewsletterDraft(supabase, authResult.email ?? "admin");
    return NextResponse.json({ success: true, id: draft.id });
  } catch (e) {
    const message = e instanceof NewsletterError ? e.message : "下書きの作成に失敗しました。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
