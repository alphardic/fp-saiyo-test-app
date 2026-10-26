import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/lib/adminAuth";
import { NEWSLETTER_REVIEWER, notifyReviewer } from "@/lib/newsletter";

/**
 * POST /api/admin/newsletters/[id]/notify
 * 赤入れのお願いメールを、確認者(田中さん)にもう一度送る(最高権限者のみ)。
 * 届かないときの原因(Resend の返答)を画面に出せるよう、失敗理由をそのまま返す。
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireSuperAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const { data } = await getSupabaseServerClient()
    .from("newsletters")
    .select("subject, body, stats")
    .eq("id", params.id)
    .maybeSingle();
  if (!data) return NextResponse.json({ error: "下書きが見つかりません。" }, { status: 404 });

  const result = await notifyReviewer("draft", data);
  if (!result.ok) {
    return NextResponse.json(
      { error: `${NEWSLETTER_REVIEWER} へのメールが送れませんでした。Resend の返答: ${result.error}` },
      { status: 500 }
    );
  }
  return NextResponse.json({ success: true });
}
