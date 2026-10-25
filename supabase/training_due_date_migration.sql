-- ===================================================
-- 社内テストの受験期限
-- Supabase の SQL Editor に貼り付けて実行してください(何度実行しても問題ありません)。
-- ===================================================

alter table public.training_courses
  add column if not exists due_date date;
