-- ===================================================
-- 分野別社内テスト: 社員用ポータル(ログイン・配布・第三者確認・結果閲覧) v0.2
-- training_authoring_migration.sql を実行済みの環境で、Supabaseの SQL Editor に貼り付けて実行してください。
-- ===================================================

-- 作成者が自分で配布を開始した日時(承認なしで配布できるようにしたため)
alter table public.training_courses
  add column if not exists published_at timestamptz;

-- ---------------------------------------------------
-- 第三者確認: 作成者が同僚に問題の確認を依頼する(任意。配布の条件ではない)
--   requested : 確認を依頼中
--   done      : 確認者が「確認しました」を押した
-- ---------------------------------------------------
create table if not exists public.training_course_reviewers (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.training_courses(id) on delete cascade,
  reviewer_employee_id uuid not null references public.employees(id) on delete cascade,
  status text not null default 'requested' check (status in ('requested', 'done')),
  comment text,
  requested_by text,
  requested_at timestamptz not null default now(),
  done_at timestamptz,
  unique (course_id, reviewer_employee_id)
);

create index if not exists training_course_reviewers_reviewer_idx
  on public.training_course_reviewers (reviewer_employee_id);

alter table public.training_course_reviewers enable row level security;

create policy "admins can read training_course_reviewers" on public.training_course_reviewers
  for select using (public.is_admin());
