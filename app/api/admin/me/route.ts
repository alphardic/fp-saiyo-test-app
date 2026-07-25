import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";

/**
 * GET /api/admin/me
 * ログイン中の管理者自身の情報(役割など)を返す。
 * フロント側で「管理者管理」ナビの表示可否などに使う。
 */
export async function GET(req: NextRequest) {
  const authResult = await requireAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  return NextResponse.json({
    userId: authResult.userId,
    role: authResult.role,
    email: authResult.email,
  });
}