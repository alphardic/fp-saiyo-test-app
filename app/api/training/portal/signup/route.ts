import { NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  ALLOWED_EMAIL_DOMAINS,
  AuthoringError,
  findOrCreateEmployee,
  handleAuthoring,
  isAllowedEmail,
} from "@/lib/trainingAuthoring";

/**
 * POST /api/training/portal/signup
 * 社員用ポータルのアカウント登録。会社のメールアドレスのみ。
 * 確認メールは送らず(メール送信元が未設定のため)、登録後すぐログインできる状態で作る。
 */
export async function POST(req: NextRequest) {
  return handleAuthoring(async () => {
    const body = (await req.json().catch(() => ({}))) as {
      name?: string;
      email?: string;
      password?: string;
    };
    const name = body.name?.trim();
    const email = body.email?.trim().toLowerCase();
    const password = body.password ?? "";

    if (!name || !email || !password) {
      throw new AuthoringError("氏名・メールアドレス・パスワードを入力してください。", 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new AuthoringError("メールアドレスの形式が正しくありません。", 400);
    }
    if (!isAllowedEmail(email)) {
      throw new AuthoringError(
        `${ALLOWED_EMAIL_DOMAINS.map((d) => "@" + d).join(" または ")} のメールアドレスのみ登録できます。`,
        403
      );
    }
    if (password.length < 8) {
      throw new AuthoringError("パスワードは8文字以上にしてください。", 400);
    }

    const supabase = getSupabaseServerClient();
    const { error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
    });
    if (error) {
      if (/already|registered|exists/i.test(error.message)) {
        throw new AuthoringError(
          "このメールアドレスは登録済みです。「ログイン」からログインしてください。パスワードを忘れた場合は田中さんに再設定を依頼してください。",
          409
        );
      }
      throw new AuthoringError("登録に失敗しました: " + error.message, 500);
    }

    await findOrCreateEmployee(name, email);
    return { ok: true };
  });
}
