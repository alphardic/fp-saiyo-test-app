# FP業界向け入社適性テストアプリ(土台)

要件定義書・strategist-agent設計書・問題バンク(65問)を踏まえて作成した、開発の出発点となるプロジェクトです。Next.js(App Router)+ Supabase + Cloudflare Pages 構成。

## 実装済みのもの

- Supabase DBスキーマ(`supabase/schema.sql`): 問題バンク・候補者・受験セッション・回答・レポート・管理者の各テーブルとRLS
- 問題バンク65問の投入用データ(`supabase/seed.json`, `supabase/seed.js`)
- 候補者向け受験画面(`/exam/[token]`): 招待トークンで受験、選択式は自動採点、記述式は保存のみ
- 管理者ログイン(`/admin/login`, マジックリンク方式)
- 管理者ダッシュボードの骨組み(`/admin`, 受験状況の一覧表示のみ)

## まだ実装していないもの(TODO)

- 記述式回答のAI採点(現状は保存のみで採点処理は未実装)
- 分野別スコアの集計・`reports`テーブルへの書き込み
- 管理者向けレポートのPDF出力
- 候補者の新規招待(招待メール送信、`candidates`テーブルへの登録)を行う管理画面
- 出題ロジックの精緻化(現状は承認済み問題からランダムに20問抽出するだけで、13分野からバランスよく抽出する仕組みは未実装)
- strategist-agent方式(Claude/Gemini/Grok協議)による問題の自動生成・検証パイプライン本体

## セットアップ手順

### 1. 依存関係のインストール

```bash
npm install
```

### 2. Supabaseの接続情報を設定

作成済みのSupabaseプロジェクトのダッシュボードから、Settings > API を開き、以下を控えます。

- Project URL
- anon public key
- service_role key(絶対に外部に漏らさないこと)

`.env.example` を `.env.local` にコピーし、値を埋めてください。

```bash
cp .env.example .env.local
```

### 3. DBスキーマの投入

Supabaseダッシュボードの SQL Editor を開き、`supabase/schema.sql` の中身を貼り付けて実行してください。

### 4. 問題バンクの投入

```bash
node -r dotenv/config supabase/seed.js dotenv_config_path=.env.local
```

(`dotenv` が未インストールの場合は `npm install dotenv` を先に実行するか、環境変数を直接設定してから `node supabase/seed.js` を実行してください。)

### 5. 最初の管理者を登録

Supabaseダッシュボードの Authentication からユーザーを1件作成(または `/admin/login` でマジックリンクを送って自分でログインを試み、Authenticationタブに作成されたユーザーのUUIDを確認)し、SQL Editorで以下を実行します。

```sql
insert into public.admins (user_id, name)
values ('<作成されたユーザーのUUID>', '田中佑輝');
```

### 6. ローカルで起動

```bash
npm run dev
```

`http://localhost:3000` で確認できます。

## Cloudflare Workersへのデプロイ

Next.js公式のCloudflareアダプター(`@opennextjs/cloudflare`)を使用しています(旧`@cloudflare/next-on-pages`/Cloudflare Pagesではなく、現行のCloudflare Workers + Workers Buildsを使う構成)。

1. このプロジェクトをGitHubリポジトリにpush
2. Cloudflareダッシュボード > Workers & Pages > Create > 「Connect GitHub」でリポジトリを連携
3. ビルド設定:
   - Build command: `npm run deploy` (build含む。`opennextjs-cloudflare build && opennextjs-cloudflare deploy`)
   - Deploy command: `npx wrangler deploy`(自動配置される場合はそのままでも可)
4. 環境変数(`.env.local` と同じ内容)をプロジェクトの Settings > Variables and secrets に設定
   - `SUPABASE_SERVICE_ROLE_KEY` は必ず Secret(暗号化)として設定し、リポジトリには絶対にコミットしないこと
5. デプロイ完了後、候補者向けリンクは `https://<プロジェクト>.workers.dev/exam/<candidatesテーブルのinvite_token>` になります

## 候補者の招待方法(現状の暫定手順)

管理画面が未実装のた