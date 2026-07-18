import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

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
    return NextResponse.json(
      { error: "認証に失敗しました: " + (userError?.message ?? "") },
      { status: 401 }
    );
  }

  const { data: adminRow, error: adminError } = await supabase
    .from("admins")
    .select("user_id")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (!adminRow) {
    return NextResponse.json(
      {
        error:
          "管理者権限がありません。(debug: " +
          (adminError?.message ?? "no row, no error") +
          ", userId=" +
          userData.user.id +
          ")",
      },
      { status: 403 }
    );
  }

  return { userId: userData.user.id };
}