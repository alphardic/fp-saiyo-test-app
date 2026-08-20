-- ===================================================
-- チーム編成(リーダー・メンバー・AI分析) v0.1
-- Supabaseの SQL Editor に貼り付けて実行してください。
-- 既存の employees テーブルを前提とします。
-- 「配属ポスト(org_posts)」機能はこのチーム機能に統合するため廃止します。
-- ===================================================

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  department text,
  goal text,
  ai_analysis jsonb,
  ai_analysis_generated_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.employees
  add column if not exists team_id uuid references public.teams(id) on delete set null,
  add column if not exists is_team_leader boolean not null default false;

-- 登録直後でほぼ未使用のため、配属ポスト機能は廃止する
drop table if exists public.org_posts cascade;
alter table public.employees drop column if exists assigned_post_id;

create index if not exists employees_team_id_idx on public.employees (team_id);

alter table public.teams enable row level security;

create policy "admins can read teams" on public.teams
  for select using (public.is_admin());
create policy "admins can write teams" on public.teams
  for all using (public.is_admin()) with check (public.is_admin());
