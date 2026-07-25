import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin, requireSuperAdmin } from "@/lib/adminAuth";

/**
 * GET /api/admin/admins
 * 管理者一覧を返す(閲覧は管理者なら誰でも可)。
 */
export async function GET(req: NextRequest) {
  const authResult = await requireAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("admins")
    .select("user_id, email, role, created_at")
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "管理者一覧の取得に失敗しました。" }, { status: 500 });
  }

  return NextResponse.json({ admins: data ?? [] });
}

/**
 * POST /api/admin/admins
 * 新しい管理者をメールで招待する(最高権限者のみ)。
 * Supabaseの招待メールを送信し、本人がリンクからパスワードを設定する。
 */
export async function POST(req: NextRequest) {
  const authResult = await requireSuperAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const body = (await req.json().catch(() => ({}))) as { email?: string };
  const email = body.email?.trim();

  if (!email) {
    return NextResponse.json({ error: "メールアドレスを入力してください。" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  const origin = req.nextUrl.origin;

  const { data: invited, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
    email,
    { redirectTo: `${origin}/admin/set-password` }
  );

  if (inviteError || !invited.user) {
    return NextResponse.json(
      { error: inviteError?.message || "招待メールの送信に失敗しました。" },
      { status: 500 }
    );
  }

  const { error: insertError } = await supabase.from("admins").upsert(
    {
      user_id: invited.user.id,
      email,
      role: "admin",
    },
    { onConflict: "user_id" }
  );

  if (insertError) {
    return NextResponse.json(
      { error: "管理者テーブルへの登録に失敗しました。" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/admin/admins?userId=...
 * 管理者を削除する(最高権限者のみ)。自分自身は削除できない。
 */
export async function DELETE(req: NextRequest) {
  const authResult = await requireSuperAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "userIdが指定されていません。" }, { status: 400 });
  }
  if (userId === authResult.userId) {
    return NextResponse.json(
      { error: "自分自身は削除できません。" },
      { status: 400 }
    );
  }

  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("admins").delete().eq("user_id", userId);

  if (error) {
    return NextResponse.json({ error: "削除に失敗しました。" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}