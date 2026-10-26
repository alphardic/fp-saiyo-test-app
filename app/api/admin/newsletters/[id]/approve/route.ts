import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/lib/adminAuth";
import {
  DELIVERY_HOUR,
  NewsletterError,
  approveNewsletter,
  cancelApproval,
  deliverNewsletter,
  jstNow,
} from "@/lib/newsletter";

/**
 * POST /api/admin/newsletters/[id]/approve
 * 下書きを承認する(最高権限者のみ)。号の1日の朝9時に自動で配信される。
 * 配信日をすでに過ぎていれば、その場で配信する。
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireSuperAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const supabase = getSupabaseServerClient();
  try {
    const { scheduledFor } = await approveNewsletter(supabase, params.id, authResult.email ?? "admin");
    const now = jstNow();
    if (scheduledFor < now.date || (scheduledFor === now.date && now.hour >= DELIVERY_HOUR)) {
      const result = await deliverNewsletter(supabase, params.id, authResult.email ?? "admin");
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });
      return NextResponse.json({ success: true, deliveredNow: true });
    }
    return NextResponse.json({ success: true, scheduledFor });
  } catch (e) {
    const message = e instanceof NewsletterError ? e.message : "承認に失敗しました。";
    return NextResponse.json({ error: message }, { status: 409 });
  }
}

/** DELETE: 承認を取り消す(配信されなくなる) */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireSuperAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  try {
    await cancelApproval(getSupabaseServerClient(), params.id);
    return NextResponse.json({ success: true });
  } catch (e) {
    const message = e instanceof NewsletterError ? e.message : "取り消しに失敗しました。";
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
