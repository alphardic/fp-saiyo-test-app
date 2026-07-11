// 問題バンク(65問)をSupabaseのquestionsテーブルに投入するスクリプト。
//
// 使い方:
//   1. .env.local (プロジェクトルート)に SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY を設定
//   2. npm install (未実行の場合)
//   3. node -r dotenv/config supabase/seed.js dotenv_config_path=.env.local
//
// もしくは、supabase/seed.json の中身をSupabaseダッシュボードの
// Table Editor から手動でインポートしても構いません。

const { createClient } = require("@supabase/supabase-js");
const seed = require("./seed.json");

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error(
    "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が環境変数に設定されていません。"
  );
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey);

async function main() {
  const { data, error } = await supabase.from("questions").insert(seed).select("id");
  if (error) {
    console.error("投入に失敗しました:", error.message);
    process.exit(1);
  }
  console.log(`${data.length}問を投入しました。`);
}

main();
