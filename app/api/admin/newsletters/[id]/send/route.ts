import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/lib/adminAuth";
import { deliverNewsletter } from "@/lib/newsletter";

/**
 * POST /api/admin/newsletters/[id]/send
 * 配信日を待たずに、今すぐ全社員のメーリングリストへ送る(最高権限者のみ)。
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireSuperAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const result = await deliverNewsletter(getSupabaseServerClient(), params.id, authResult.email ?? "admin");
  if (!result.ok) {
    const conflict = result.error.includes("送信済み");
    return NextResponse.json({ error: result.error }, { status: conflict ? 409 : 500 });
  }
  return NextResponse.json({ success: true });
}
