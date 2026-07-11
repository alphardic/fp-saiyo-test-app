import { createClient } from "@supabase/supabase-js";

/**
 * サーバーサイド(API Routes)専用のSupabaseクライアント。
 * service role keyはRLSを迂回できる強力な権限を持つため、
 * 絶対にブラウザ側のコード(クライアントコンポーネント)から
 * importしないこと。
 */
export function getSupabaseServerClient() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_URL または SUPABASE_SERVICE_ROLE_KEY が設定されていません。.env.local を確認してください。"
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}
