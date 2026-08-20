-- ===================================================
-- 社員テーブル拡張(役職・上司・適性職種キャッシュ・配属) + 配属ポスト管理 v0.1
-- Supabaseの SQL Editor に貼り付けて実行してください。
-- 既存の employees テーブルを前提とします。
-- ===================================================

-- ---------------------------------------------------
-- 社員テーブルの拡張
-- ---------------------------------------------------
alter table public.employees
  add column if not exists position text,
  add column if not exists manager_id uuid references public.employees(id) on delete set null,
  add column if not exists suitable_roles jsonb,
  add column if not exists suitable_roles_generated_at timestamptz,
  add column if not exists assigned_post_id uuid;

-- ---------------------------------------------------
-- 配属ポスト(役職の空き枠。部署・職種区分をタグ付けできる)
-- 同じ役職に複数枠が必要な場合は、同じ title の行を複数作成する運用とする
-- ---------------------------------------------------
create table public.org_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  department text,
  role_category text check (role_category in (
    '開拓','FP','保険販売','不動産販売','不動産仕入','事務',
    'マネソルの販売','マーケティング','マネジメント','企画','経営'
  )),
  created_at timestamptz not null default now()
);

-- assigned_post_id の外部キーは org_posts 作成後に追加
alter table public.employees
  add constraint employees_assigned_post_id_fkey
  foreign key (assigned_post_id) references public.org_posts(id) on delete set null;

create index if not exists employees_manager_id_idx on public.employees (manager_id);
create index if not exists employees_assigned_post_id_idx on public.employees (assigned_post_id);

-- ===================================================
-- RLS: 既存テーブルと同じ方針(admins テーブル・is_admin() 関数は
-- supabase/schema.sql で既に作成済みという前提)。
-- ===================================================

alter table public.org_posts enable row level security;

create policy "admins can read org_posts" on public.org_posts
  for select using (public.is_admin());
create policy "admins can write org_posts" on public.org_posts
  for all using (public.is_admin()) with check (public.is_admin());

-- 注意: employees テーブル自体の RLS ポリシーは、当初 Supabase ダッシュボードで
-- 直接作成されたため本リポジトリに定義がありません(supabase/schema.sql は
-- employees 作成前の内容で止まっています)。今回追加した列
-- (position/manager_id/suitable_roles/suitable_roles_generated_at/assigned_post_id)
-- は既存の employees の行そのものへの列追加であり、行レベルのアクセス制御は
-- 既存のポリシーがそのまま引き続き適用されます。ただし、その既存ポリシーの
-- 内容自体をこのリポジトリでは確認できていないため、本番DBのSupabase
-- ダッシュボード側で employees テーブルの RLS 設定を一度確認することを
-- 推奨します(is_admin() ベースの読み書き許可になっているか、等)。
