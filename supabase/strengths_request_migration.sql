-- ===================================================
-- ストレングスファインダー 受検依頼ステータス v0.1
-- Supabaseの SQL Editor に貼り付けて実行してください。
-- 既存の employees / candidates テーブルを前提とします。
-- ===================================================

alter table public.employees add column if not exists strengths_requested_at timestamptz;
alter table public.candidates add column if not exists strengths_requested_at timestamptz;
