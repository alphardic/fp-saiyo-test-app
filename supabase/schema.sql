-- ===================================================
-- FP業界向け入社適性テストアプリ DBスキーマ v0.1
-- Supabase(PostgreSQL)の SQL Editor に貼り付けて実行してください。
-- ===================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------
-- 問題バンク(strategist-agent方式で作成・承認された問題)
-- ---------------------------------------------------
create table public.questions (
  id uuid primary key default gen_random_uuid(),
  field text not null check (field in (
    '為替市場','金利市場','株式投資','投資信託','債券','iDeCo','NISA',
    '居住用不動産','投資用不動産','個人の税金','保険','家計管理','ライフプラン'
  )),
  type text not null check (type in ('選択式','記述式')),
  question text not null,
  choices jsonb,                    -- 選択式のみ。例: ["A. ...","B. ...","C. ...","D. ..."]
  answer text not null,             -- 選択式は正解記号、記述式は模範解答
  explanation text not null,        -- 解説 or 採点観点
  topic_date text,                  -- 扱っている時事テーマの時期(例: "2026年6月")
  generated_by text,                -- 原案を作成したAI(claude/gemini/grok)
  verified_by jsonb,                -- 検証を行った他の2AI
  verification_scores jsonb,        -- 各AIによる検証スコア
  status text not null default 'draft' check (status in ('draft','approved','retired')),
  approved_by text,                 -- 承認した管理者名
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------
-- 候補者(受験者)
-- ---------------------------------------------------
create table public.candidates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  invite_token uuid not null default gen_random_uuid(), -- 受験用URLに使う一意トークン
  invited_by text,                  -- 招待した管理者名
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------
-- 受験セッション(候補者1人につき原則1回)
-- ---------------------------------------------------
create table public.exam_sessions (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  status text not null default 'not_started' check (status in ('not_started','in_progress','submitted','graded')),
  question_ids uuid[] not null,     -- この候補者に出題する問題ID一覧(分野ごとにランダム抽出想定)
  started_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------
-- 回答
-- ---------------------------------------------------
create table public.answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.exam_sessions(id) on delete cascade,
  question_id uuid not null references public.questions(id),
  candidate_answer text,
  is_correct boolean,               -- 選択式: 自動採点結果
  ai_score numeric,                 -- 記述式: AI採点スコア(0-100想定)
  ai_grading_notes text,            -- 記述式: AI採点の根拠
  created_at timestamptz not null default now(),
  unique (session_id, question_id)
);

-- ---------------------------------------------------
-- 管理者向けレポート(分野別の強み・弱み分析)
-- ---------------------------------------------------
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.exam_sessions(id) on delete cascade,
  field_scores jsonb not null,      -- 例: {"為替市場": 80, "iDeCo": 40, ...}
  overall_summary text,             -- AIが生成する強み・弱みのサマリー
  pdf_url text,                     -- Supabase Storage等に保存したPDFのURL
  generated_at timestamptz not null default now()
);

-- ---------------------------------------------------
-- 管理者(採用担当)ユーザー
-- 認証自体はSupabase Auth(auth.users)を利用し、
-- ここでは「誰が管理者権限を持つか」だけを管理する。
-- ---------------------------------------------------
create table public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text,
  created_at timestamptz not null default now()
);

-- ===================================================
-- RLS(行レベルセキュリティ)
--
-- 設計方針:
-- ・候補者(candidates/exam_sessions/answers)のデータには、
--   匿名(anon)・一般ログインユーザー(authenticated)からは
--   一切直接アクセスさせない。
-- ・候補者の受験画面は招待トークンでアクセスするだけで、
--   Supabaseアカウントは作らない想定。そのため候補者側の
--   読み書きは、Next.jsのAPI Routes(サーバーサイド、
--   service role keyを使用)を必ず経由させる。
-- ・管理者はSupabase Authでログインし、adminsテーブルに
--   登録されている場合のみ全データを閲覧・操作できる。
-- ===================================================

alter table public.questions enable row level security;
alter table public.candidates enable row level security;
alter table public.exam_sessions enable row level security;
alter table public.answers enable row level security;
alter table public.reports enable row level security;
alter table public.admins enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admins where user_id = auth.uid()
  );
$$;

create policy "admins can read questions" on public.questions
  for select using (public.is_admin());
create policy "admins can write questions" on public.questions
  for all using (public.is_admin()) with check (public.is_admin());

create policy "admins can read candidates" on public.candidates
  for select using (public.is_admin());
create policy "admins can write candidates" on public.candidates
  for all using (public.is_admin()) with check (public.is_admin());

create policy "admins can read exam_sessions" on public.exam_sessions
  for select using (public.is_admin());

create policy "admins can read answers" on public.answers
  for select using (public.is_admin());

create policy "admins can read reports" on public.reports
  for select using (public.is_admin());

create policy "admins manage admins" on public.admins
  for all using (public.is_admin()) with check (public.is_admin());

-- 注意: anon/authenticatedロールにはこれ以上の権限を付与しない。
-- 候補者向けAPI Routes(app/api/exam/[token]/*)は、
-- SUPABASE_SERVICE_ROLE_KEY を使ってRLSを迂回する
-- サーバーサイド専用のクライアントからのみアクセスすること。
-- このキーは絶対にブラウザ側のコードに含めないこと。

-- ---------------------------------------------------
-- 最初の管理者を登録する場合の例(Supabase Authでユーザー作成後に実行):
-- insert into public.admins (user_id, name)
-- values ('<auth.usersのUUID>', '田中佑輝');
-- ---------------------------------------------------
