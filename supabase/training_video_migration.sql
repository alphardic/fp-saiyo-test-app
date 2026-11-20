-- ============================================================
-- 社内テストに研修動画(Vimeo)を付ける機能の追加
--
-- Supabase ダッシュボード > SQL Editor に貼り付けて実行してください。
-- 何度実行しても壊れないように書いてあります。
--
-- 1. training_courses に動画の URL を持たせる(テスト1つにつき動画1本)
-- 2. 社員ごとの視聴記録 training_video_progress を作る
--    動画が設定されたテストは、動画を最後まで見ないと受験を始められない
-- ============================================================

alter table public.training_courses
  add column if not exists video_url text;

create table if not exists public.training_video_progress (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.training_enrollments(id) on delete cascade,
  -- どの動画の記録か。テストの動画が差し替えられたら記録をやり直すために持つ
  video_url text not null,
  -- 動画の長さ(秒)。プレーヤーから受け取る
  duration_sec integer not null default 0,
  -- 再生した秒(0始まりの何秒目か)の一覧。早送りで飛ばした秒は入らない
  watched_seconds integer[] not null default '{}',
  -- 再生した秒数の合計(watched_seconds の件数)
  watched_sec integer not null default 0,
  -- 長さの95%以上を再生した日時。null なら未完了
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (enrollment_id)
);

create index if not exists idx_training_video_progress_enrollment
  on public.training_video_progress(enrollment_id);

-- ほかの研修テーブルと同じく、読み書きはサーバー(API Route)経由のみ。
-- 管理者だけ直接参照できるようにしておく
alter table public.training_video_progress enable row level security;

drop policy if exists "admins can read training_video_progress" on public.training_video_progress;
create policy "admins can read training_video_progress"
  on public.training_video_progress for select
  using (public.is_admin());
