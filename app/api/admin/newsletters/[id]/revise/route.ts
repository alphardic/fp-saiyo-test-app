import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/lib/adminAuth";
import { NewsletterError, reviseNewsletter } from "@/lib/newsletter";

/**
 * POST /api/admin/newsletters/[id]/revise
 * 赤入れ(修正指示)を受けて、AIが下書きを直す(最高権限者のみ)。body: { feedback }
 * 直す前の文面と指示は履歴に残り、次の号を書くときにもAIが読む。
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireSuperAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const body = (await req.json().catch(() => ({}))) as { feedback?: string };
  const feedback = body.feedback?.trim();
  if (!feedback) {
    return NextResponse.json({ error: "赤入れ(直してほしいこと)を書いてください。" }, { status: 400 });
  }

  try {
    const revised = await reviseNewsletter(
      getSupabaseServerClient(),
      params.id,
      feedback,
      authResult.email ?? "admin"
    );
    return NextResponse.json({ success: true, note: revised.note });
  } catch (e) {
    const message = e instanceof NewsletterError ? e.message : "AIによる修正に失敗しました。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
