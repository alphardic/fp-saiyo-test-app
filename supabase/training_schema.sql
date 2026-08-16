-- ===================================================
-- 分野別社内テスト(training) DBスキーマ v0.1
-- Supabaseの SQL Editor に貼り付けて実行してください。
-- 既存の employees テーブルを前提とします。
-- ===================================================

-- ---------------------------------------------------
-- コース(分野別テストの単位。第一弾: MUJIハウス提携知識テスト)
-- ---------------------------------------------------
create table public.training_courses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------
-- 問題(知識ポイントごとに group_key で束ね、
-- 同じ group_key 内の複数行がカンニング対策のパターン違いバリエーション)
-- ---------------------------------------------------
create table public.training_questions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.training_courses(id) on delete cascade,
  group_key text not null,
  group_label text not null,
  sort_order int not null default 0,
  question text not null,
  choices jsonb not null,
  answer text not null,
  explanation text not null,
  status text not null default 'active' check (status in ('active', 'retired')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------
-- 受講登録(社員 × コース。招待トークンで受験ページにアクセスし、何度でも再受験可能)
-- ---------------------------------------------------
create table public.training_enrollments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.training_courses(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  invite_token uuid not null default gen_random_uuid(),
  invited_by text,
  created_at timestamptz not null default now(),
  unique (course_id, employee_id)
);

-- ---------------------------------------------------
-- 受験(挑戦)ごとのセッション
-- ---------------------------------------------------
create table public.training_attempts (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.training_enrollments(id) on delete cascade,
  status text not null default 'in_progress' check (status in ('in_progress', 'submitted')),
  question_ids uuid[] not null,
  score int,
  total int,
  passed boolean,
  started_at timestamptz not null default now(),
  submitted_at timestamptz
);

-- ---------------------------------------------------
-- 回答
-- ---------------------------------------------------
create table public.training_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.training_attempts(id) on delete cascade,
  question_id uuid not null references public.training_questions(id),
  employee_answer text,
  is_correct boolean,
  created_at timestamptz not null default now(),
  unique (attempt_id, question_id)
);

create index training_questions_course_group_idx
  on public.training_questions (course_id, group_key);
create index training_enrollments_employee_idx
  on public.training_enrollments (employee_id);
create index training_attempts_enrollment_idx
  on public.training_attempts (enrollment_id);

-- ===================================================
-- RLS: 既存テーブルと同じ方針。
-- 管理者はSupabase Authでログインし、is_admin()で全データを閲覧・操作できる。
-- 受験者(社員)は招待トークンでアクセスするだけで、Supabaseアカウントは作らない。
-- 受験画面はNext.jsのAPI Routes(service role key)を必ず経由させる。
-- ===================================================

alter table public.training_courses enable row level security;
alter table public.training_questions enable row level security;
alter table public.training_enrollments enable row level security;
alter table public.training_attempts enable row level security;
alter table public.training_answers enable row level security;

create policy "admins can read training_courses" on public.training_courses
  for select using (public.is_admin());
create policy "admins can write training_courses" on public.training_courses
  for all using (public.is_admin()) with check (public.is_admin());

create policy "admins can read training_questions" on public.training_questions
  for select using (public.is_admin());
create policy "admins can write training_questions" on public.training_questions
  for all using (public.is_admin()) with check (public.is_admin());

create policy "admins can read training_enrollments" on public.training_enrollments
  for select using (public.is_admin());

create policy "admins can read training_attempts" on public.training_attempts
  for select using (public.is_admin());

create policy "admins can read training_answers" on public.training_answers
  for select using (public.is_admin());

-- 注意: anon/authenticatedロールにはこれ以上の権限を付与しない。
-- 社員向けAPI Routes(app/api/training/[token]/*)は、
-- SUPABASE_SERVICE_ROLE_KEY を使ってRLSを迂回するサーバーサイド専用クライアントからのみアクセスすること。

-- ---------------------------------------------------
-- 第一弾コースの登録
-- ---------------------------------------------------
insert into public.training_courses (name, description, status)
values (
  'MUJIハウス提携知識テスト',
  'MUJIハウスから紹介を受けた候補者にFPとして対応するために必要な、住宅性能・保証・税制優遇に関する知識を問うテスト。全問正解で合格。',
  'active'
);
