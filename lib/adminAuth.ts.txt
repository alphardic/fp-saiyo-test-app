import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * API Route内で「管理者としてログイン済みか」を検証するヘルパー。
 * PostgREST側のRLS判定に頼らず、service role clientで
 * ユーザー検証・admins判定の両方をサーバーサイドで行う。
 * (Data API側でJWT検証がうまくいかないケースを回避するため)
 */
export async function requireAdmin(
  req: NextRequest
): Promise<{ userId: string } | NextResponse> {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "");

  if (!token) {
    return NextResponse.json({ error: "認証情報がありません。" }, { status: 401 });
  }

  const supabase = getSupabaseServerClient();
  const { data: userData, error: userError } = await supabase.auth.getUser(token);

  if (userError || !userData.user) {
    return NextResponse.json({ error: "認証に失敗しました。" }, { status: 401 });
  }

  const { data: adminRow } = await supabase
    .from("admins")
    .select("user_id")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (!adminRow) {
    return NextResponse.json({ error: "管理者権限がありません。" }, { status: 403 });
  }

  return { userId: userData.user.id };
}