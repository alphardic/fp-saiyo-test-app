-- ============================================================
-- 動画アップロードからテスト作成・カリキュラム化までの流れ
--
-- Supabase ダッシュボード > SQL Editor に貼り付けて実行してください。
-- 何度実行しても壊れないように書いてあります。
-- 先に supabase/training_video_migration.sql を実行しておく必要があります。
--
-- 1. training_courses に Vimeo の動画ID(uri)を持たせる(アプリからアップロードした動画)
-- 2. カリキュラム(テストを順番に並べたもの)と、その受講者を管理するテーブル
-- ============================================================

alter table public.training_courses
  add column if not exists vimeo_uri text;

-- カリキュラム本体
create table if not exists public.training_curricula (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  author_employee_id uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now()
);

-- カリキュラムに含めるテストと並び順
create table if not exists public.training_curriculum_items (
  id uuid primary key default gen_random_uuid(),
  curriculum_id uuid not null references public.training_curricula(id) on delete cascade,
  course_id uuid not null references public.training_courses(id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (curriculum_id, course_id)
);

-- カリキュラムの受講者。token で受講者専用のカリキュラムページを開く
create table if not exists public.training_curriculum_enrollments (
  id uuid primary key default gen_random_uuid(),
  curriculum_id uuid not null references public.training_curricula(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  token uuid not null default gen_random_uuid(),
  invited_by text,
  created_at timestamptz not null default now(),
  unique (curriculum_id, employee_id),
  unique (token)
);

create index if not exists idx_training_curriculum_items_curriculum
  on public.training_curriculum_items(curriculum_id);
create index if not exists idx_training_curriculum_enrollments_curriculum
  on public.training_curriculum_enrollments(curriculum_id);

-- ほかの研修テーブルと同じく、読み書きはサーバー(API Route)経由のみ。管理者だけ直接参照できる
alter table public.training_curricula enable row level security;
alter table public.training_curriculum_items enable row level security;
alter table public.training_curriculum_enrollments enable row level security;

drop policy if exists "admins can read training_curricula" on public.training_curricula;
create policy "admins can read training_curricula"
  on public.training_curricula for select using (public.is_admin());

drop policy if exists "admins can read training_curriculum_items" on public.training_curriculum_items;
create policy "admins can read training_curriculum_items"
  on public.training_curriculum_items for select using (public.is_admin());

drop policy if exists "admins can read training_curriculum_enrollments" on public.training_curriculum_enrollments;
create policy "admins can read training_curriculum_enrollments"
  on public.training_curriculum_enrollments for select using (public.is_admin());
