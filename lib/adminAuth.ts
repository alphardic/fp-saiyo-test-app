import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export type AdminRole = "super_admin" | "admin";

export interface AdminIdentity {
  userId: string;
  role: AdminRole;
  email: string | null;
}

/**
 * API Route内で「管理者としてログイン済みか」を検証するヘルパー。
 * PostgREST側のRLS判定に頼らず、service role clientで
 * ユーザー検証・admins判定の両方をサーバーサイドで行う。
 * (Data API側でJWT検証がうまくいかないケースを回避するため)
 */
export async function requireAdmin(
  req: NextRequest
): Promise<AdminIdentity | NextResponse> {
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
    .select("user_id, role, email")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (!adminRow) {
    return NextResponse.json({ error: "管理者権限がありません。" }, { status: 403 });
  }

  return {
    userId: userData.user.id,
    role: (adminRow.role as AdminRole) ?? "admin",
    email: adminRow.email ?? userData.user.email ?? null,
  };
}

/**
 * requireAdminに加えて、最高権限者(super_admin)であることを検証する。
 * 管理者の招待・削除など、権限の強いAPIで使う。
 */
export async function requireSuperAdmin(
  req: NextRequest
): Promise<AdminIdentity | NextResponse> {
  const result = await requireAdmin(req);
  if (result instanceof NextResponse) return result;
  if (result.role !== "super_admin") {
    return NextResponse.json(
      { error: "この操作には最高権限者の権限が必要です。" },
      { status: 403 }
    );
  }
  return result;
}