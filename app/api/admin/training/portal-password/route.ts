import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/adminAuth";

/**
 * POST /api/admin/training/portal-password
 * パスワードを忘れた社員の、社員用ページのパスワードを管理者が再設定する。
 * 管理者アカウントのパスワードはここでは変更できない(権限の乗っ取りを防ぐため)。
 */
export async function POST(req: NextRequest) {
  const authResult = await requireAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const body = (await req.json().catch(() => ({}))) as { email?: string; password?: string };
  const email = body.email?.trim().toLowerCase();
  const password = body.password ?? "";
  if (!email || password.length < 8) {
    return NextResponse.json(
      { error: "メールアドレスと、8文字以上の新しいパスワードを入力してください。" },
      { status: 400 }
    );
  }

  const supabase = getSupabaseServerClient();
  let userId: string | null = null;
  for (let page = 1; page <= 20 && !userId; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) {
      return NextResponse.json({ error: "ユーザーの検索に失敗しました。" }, { status: 500 });
    }
    userId = data.users.find((u) => u.email?.toLowerCase() === email)?.id ?? null;
    if (data.users.length < 1000) break;
  }
  if (!userId) {
    return NextResponse.json(
      { error: "このメールアドレスはまだ社員用ページに登録されていません。" },
      { status: 404 }
    );
  }

  const { data: adminRow } = await supabase.from("admins").select("user_id").eq("user_id", userId).maybeSingle();
  if (adminRow) {
    return NextResponse.json(
      { error: "管理者アカウントのパスワードは、ここでは変更できません。" },
      { status: 403 }
    );
  }

  const { error } = await supabase.auth.admin.updateUserById(userId, { password });
  if (error) {
    return NextResponse.json({ error: "再設定に失敗しました: " + error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
