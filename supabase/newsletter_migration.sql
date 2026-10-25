-- ===================================================
-- 社内テストのお知らせメール(AIが下書き → 田中さんが確認して全社員に送る)
-- Supabase の SQL Editor に貼り付けて実行してください(何度実行しても問題ありません)。
-- ===================================================

create table if not exists public.newsletters (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'draft' check (status in ('draft', 'sent', 'discarded')),
  subject text not null,
  body text not null,
  stats jsonb,                 -- 下書きを作ったときに AI に渡した利用データ(あとで根拠を確認するため)
  created_by text,             -- 'schedule'(定期実行) または作成した管理者のメールアドレス
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  sent_by text
);

create index if not exists newsletters_created_at_idx on public.newsletters (created_at desc);

alter table public.newsletters enable row level security;

drop policy if exists "admins can read newsletters" on public.newsletters;
create policy "admins can read newsletters" on public.newsletters
  for select using (public.is_admin());
