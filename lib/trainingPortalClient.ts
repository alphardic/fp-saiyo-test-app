import { supabaseBrowser } from "@/lib/supabase/browser";

/**
 * 社員用ポータル(/training/portal)から作問APIを呼ぶときのヘッダー。
 * x-portal: 1 を付けると、サーバー側はログイン中の社員として扱う(管理者としては扱わない)。
 */
export async function portalHeaders(): Promise<Record<string, string>> {
  const { data } = await supabaseBrowser.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: "Bearer " + token, "x-portal": "1" } : { "x-portal": "1" };
}

export async function hasPortalSession(): Promise<boolean> {
  const { data } = await supabaseBrowser.auth.getSession();
  return !!data.session;
}

export const PORTAL_LOGIN_PATH = "/training/portal";
export const PORTAL_HOME_PATH = "/training/portal/home";
