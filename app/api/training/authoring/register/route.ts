import { NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  ALLOWED_EMAIL_DOMAINS,
  AuthoringError,
  findOrCreateEmployee,
  handleAuthoring,
} from "@/lib/trainingAuthoring";

/**
 * POST /api/training/authoring/register
 * 社員が氏名・メールアドレスを入力して、自分専用の作問用リンク(トークン)を受け取る。
 * 既に発行済みなら同じトークンを返す。
 */
export async function POST(req: NextRequest) {
  return handleAuthoring(async () => {
    const body = (await req.json().catch(() => ({}))) as { name?: string; email?: string };
    const name = body.name?.trim();
    const email = body.email?.trim().toLowerCase();

    if (!name || !email) {
      throw new AuthoringError("氏名とメールアドレスを入力してください。", 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new AuthoringError("メールアドレスの形式が正しくありません。", 400);
    }
    if (!ALLOWED_EMAIL_DOMAINS.some((d) => email.endsWith("@" + d))) {
      throw new AuthoringError(
        `${ALLOWED_EMAIL_DOMAINS.map((d) => "@" + d).join(" または ")} のメールアドレスのみ登録できます。`,
        403
      );
    }

    const employee = await findOrCreateEmployee(name, email);
    const supabase = getSupabaseServerClient();

    const { data: existing } = await supabase
      .from("training_authors")
      .select("author_token")
      .eq("employee_id", employee.id)
      .maybeSingle();
    if (existing) return { authorToken: existing.author_token };

    const { data: created, error } = await supabase
      .from("training_authors")
      .insert({ employee_id: employee.id })
      .select("author_token")
      .single();
    if (error || !created) {
      throw new AuthoringError("登録に失敗しました: " + (error?.message ?? ""), 500);
    }
    return { authorToken: created.author_token };
  });
}
