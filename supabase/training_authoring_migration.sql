-- ===================================================
-- 分野別社内テスト: 社員による作問 → 承認申請 → 承認 の仕組み v0.1
-- training_schema.sql を実行済みの環境で、Supabaseの SQL Editor に貼り付けて実行してください。
-- ===================================================

-- ---------------------------------------------------
-- コースに「下書き / 承認待ち / 差し戻し」の状態と作成者・資料メモを追加
--   draft    : 作成者が作問中(受験者には見えない)
--   pending  : 承認申請中(作成者は編集不可、管理者のみ修正可)
--   rejected : 差し戻し(作成者が再修正して再申請できる)
--   active   : 承認済み。受験に使える(既存の状態)
-- ---------------------------------------------------
alter table public.training_courses drop constraint if exists training_courses_status_check;
alter table public.training_courses
  add constraint training_courses_status_check
  check (status in ('draft', 'pending', 'rejected', 'active', 'archived'));

alter table public.training_courses
  add column if not exists author_employee_id uuid references public.employees(id) on delete set null,
  add column if not exists target_audience text,
  add column if not exists source_notes text not null default '',
  add column if not exists outline jsonb not null default '[]'::jsonb,
  add column if not exists variants_per_point int not null default 3,
  add column if not exists review_comment text,
  add column if not exists submitted_at timestamptz,
  add column if not exists decided_at timestamptz,
  add column if not exists decided_by text;

-- ---------------------------------------------------
-- 作問者(社員)ごとの作問用リンク
-- ---------------------------------------------------
create table if not exists public.training_authors (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null unique references public.employees(id) on delete cascade,
  author_token uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------
-- 作問ルール(AIが問題を作るときに必ず守る決まりごと)。
-- 社員・管理者の指摘から自動で増えていき、管理者がON/OFF・編集できる。
-- ---------------------------------------------------
create table if not exists public.training_authoring_rules (
  id uuid primary key default gen_random_uuid(),
  rule text not null,
  source text not null default 'feedback' check (source in ('initial', 'feedback', 'manual')),
  created_by text,
  source_course_id uuid references public.training_courses(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------
-- 問題への指摘の履歴(誰が・どの問題に・何を指摘し、どう直ったか)
-- ---------------------------------------------------
create table if not exists public.training_question_feedback (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.training_courses(id) on delete cascade,
  question_id uuid references public.training_questions(id) on delete set null,
  kind text not null check (kind in ('comment', 'manual_edit')),
  comment text,
  before jsonb,
  after jsonb,
  learned_rule_id uuid references public.training_authoring_rules(id) on delete set null,
  created_by text,
  created_at timestamptz not null default now()
);

create index if not exists training_courses_author_idx
  on public.training_courses (author_employee_id);
create index if not exists training_question_feedback_course_idx
  on public.training_question_feedback (course_id);

alter table public.training_authors enable row level security;
alter table public.training_authoring_rules enable row level security;
alter table public.training_question_feedback enable row level security;

create policy "admins can read training_authors" on public.training_authors
  for select using (public.is_admin());
create policy "admins can read training_authoring_rules" on public.training_authoring_rules
  for select using (public.is_admin());
create policy "admins can read training_question_feedback" on public.training_question_feedback
  for select using (public.is_admin());

-- ---------------------------------------------------
-- 初期ルール: MUJIハウス提携知識テストを作ったときの指摘(2026-08-16)から抽出
-- ---------------------------------------------------
insert into public.training_authoring_rules (rule, source, created_by) values
('「資料によれば」「資料の記載として」のように資料の文言を問う設問にしない。実務で使う知識・判断そのものを直接問う。', 'initial', '田中'),
('消去法で解けてしまう「明らかに誤り」な選択肢を作らない。数字を近づける・条件を一つだけ変える・もっともらしい誤解を混ぜるなど、最後まで迷う4択にする。', 'initial', '田中'),
('問題文に数値を並べて差や大小を計算させるだけの設問にしない。その分野の知識がなくても解けてしまうため、知識そのものを問う。', 'initial', '田中'),
('正解の選択肢だけ数字や表現が具体的(例: 39,547円)で、誤答がキリのいい数字や数字なしになっていないか確認する。全選択肢の具体性・長さ・言い回しの粒度を揃え、雰囲気で正解が分からないようにする。', 'initial', '田中'),
('各設問は他の設問の文脈を引き継がず単独で出題される。借入額・金利・地域・面積・試算条件などの前提は、同じ知識ポイントの全パターンの設問文にそれぞれ明記する。', 'initial', '田中'),
('数字には単位と範囲を明示する(坪単価か総額か、全国か首都圏か、税込か税抜か、いつ時点の数字か)。前提が曖昧だと答えようがない。', 'initial', '田中'),
('同じ知識ポイントの別パターンやテスト内の他の設問と矛盾する表現をしない(例: ある設問で「大手より安い」、別の設問で「大手レンジ内」)。', 'initial', '田中'),
('似た用語を混同しない。例えば「生涯年収(税引前の総収入)」と「使えるお金の総額(可処分所得)」を同一視するような誤った等式を作らない。', 'initial', '田中'),
('一般的な制度・業界知識だけで完結させず、テスト対象の商品・提携先が「その中でどこに位置するか」(例: MUJI HOUSEのUA値0.41は基準のどこに当たるか)まで問う。', 'initial', '田中'),
('提携先・商品のPRに使う比較表現は具体的な事実で書く(例: 「スペック同水準で総額1,000万円安い」)。曖昧な優位性の表現にしない。', 'initial', '田中'),
('正解の記号(A〜D)が特定の位置に偏らないよう、知識ポイントごとに分散させる。', 'initial', 'システム');
