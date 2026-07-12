import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/adminAuth";

/**
 * GET /api/admin/dashboard
 * 管理画面用: 候補者一覧 + 受験セッション一覧をまとめて返す。
 */
export async function GET(req: NextRequest) {
  const authResult = await requireAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const supabase = getSupabaseServerClient();

  const { data: candidates, error: candidateError } = await supabase
    .from("candidates")
    .select("id, name, email, invite_token, created_at")
    .order("created_at", { ascending: false });

  const { data: sessions, error: sessionError } = await supabase
    .from("exam_sessions")
    .select("id, status, submitted_at, candidates(name, email)")
    .order("submitted_at", { ascending: false });

  if (candidateError || sessionError) {
    return NextResponse.json(
      { error: "データの取得に失敗しました。" },
      { status: 500 }
    );
  }

  return NextResponse.json({ candidates, sessions });
}