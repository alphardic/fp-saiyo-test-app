import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/adminAuth";

/**
 * POST /api/admin/candidates/[id]/strengths-request
 * ストレングスファインダーの受検を依頼したことを記録する
 * (Gallup公式サイトで受検してもらうため、このアプリ内で採点は行わない)。
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const supabase = getSupabaseServerClient();
  const requestedAt = new Date().toISOString();

  const { data, error } = await supabase
    .from("candidates")
    .update({ strengths_requested_at: requestedAt })
    .eq("id", params.id)
    .select("id, strengths_requested_at")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "記録に失敗しました: " + (error?.message ?? "") },
      { status: 500 }
    );
  }

  return NextResponse.json({ requestedAt });
}
