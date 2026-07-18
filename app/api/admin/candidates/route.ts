import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/adminAuth";

/**
 * POST /api/admin/candidates
 * 管理画面から候補者を新規登録する。
 */
export async function POST(req: NextRequest) {
  const authResult = await requireAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const body = (await req.json()) as { name?: string; email?: string };
  const name = body.name?.trim();
  const email = body.email?.trim();

  if (!name || !email) {
    return NextResponse.json(
      { error: "名前とメールアドレスを入力してください。" },
      { status: 400 }
    );
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("candidates")
    .insert({ name, email })
    .select("id, name, email, invite_token, created_at")
    .single();

  if (error) {
    const message =
      error.code === "23505"
        ? "このメールアドレスは既に登録されています。"
        : "登録に失敗しました: " + error.message;
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({ candidate: data });
}