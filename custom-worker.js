// Cloudflare Workers の入口。OpenNext が生成する .open-next/worker.js に、定期実行(Cron Trigger)を足す。
// wrangler.jsonc の "main" と "triggers.crons" から使われる。

// @ts-ignore .open-next/worker.js は opennextjs-cloudflare build で生成される
import { default as handler } from "./.open-next/worker.js";

export default {
  fetch: handler.fetch,

  /** 毎時、お知らせメールの定期処理(下書き作成・催促・承認済みの号の配信)を呼ぶ */
  async scheduled(event, env, ctx) {
    const request = new Request(
      "https://fp-saiyo-test-app.tanaka-a6c.workers.dev/api/cron/newsletter",
      { method: "POST", headers: { "x-cron-secret": env.SUPABASE_SERVICE_ROLE_KEY ?? "" } }
    );
    ctx.waitUntil(handler.fetch(request, env, ctx));
  },
};

// @ts-ignore OpenNext が使う Durable Object をそのまま公開する
export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from "./.open-next/worker.js";
