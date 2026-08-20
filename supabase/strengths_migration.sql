-- ===================================================
-- ストレングスファインダー(CliftonStrengths)の上位5資質 v0.1
-- Supabaseの SQL Editor に貼り付けて実行してください。
-- 既存の employees / candidates テーブルを前提とします。
-- ===================================================

alter table public.employees add column if not exists strengths text[];
alter table public.candidates add column if not exists strengths text[];
