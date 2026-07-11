import { createClient } from "@supabase/supabase-js";

/**
 * ブラウザ側(管理者ログイン画面など)で使うSupabaseクライアント。
 * anon keyのみを使用し、実際のデータアクセスはRLS(admins判定)で制御される。
 */
export const supabaseBrowser = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
