import Anthropic from "@anthropic-ai/sdk";
import { SupabaseClient } from "@supabase/supabase-js";
import { sendNewsletterEmail, sendToNewsletterReviewer } from "@/lib/notify";

/**
 * 社内テストのお知らせメール(月1回、毎月1日に全社員へ配信)。
 *
 * 毎月25日ごろ、4人のAIエージェントが順番に下書きを作り、田中さんに赤入れを依頼する。
 *   1. 分析担当   … 社内テストがどう使われたかを、利用データから読み解く
 *   2. 発想担当   … 分析と機能一覧から、名前を出さずに「こんな使い方ができる」を考える
 *   3. 文章担当   … 発想担当の案を、楽しく使えそうな月1回のメールに書く
 *   4. 仕上げ担当 … 季節(11月始まりの会社の暦、FP・不動産の時期)に合わせ、人間味を確認して仕上げる
 * 田中さんが赤入れ(修正指示)を書くと、AIが直して返す。承認したメールは翌月1日の朝9時に自動で配信する。
 * 全員宛てなので、個人の点数・未合格者の名前・採用候補者の情報は扱わない。
 *
 * 専用のカラムは増やさず、エージェントの途中経過・赤入れの履歴・承認は newsletters.stats(jsonb)に入れる。
 */

export const NEWSLETTER_TO = "all_alpha@alpha-fp.com";
export const NEWSLETTER_REVIEWER = "tanaka@alpha-fp.com";
export const APP_URL = "https://fp-saiyo-test-app.tanaka-a6c.workers.dev";
export const SENDER_NAME = "アルファグループの知識を高めるAIくん";
/** この日以降(日本時間)に、翌月号の下書きを作る */
export const DRAFT_DAY = 25;
/** 配信・催促メールを送る時刻(日本時間) */
export const DELIVERY_HOUR = 9;

const MODEL = "claude-opus-5-5";

export class NewsletterError extends Error {}

// ---------------------------------------------------------------------------
// 日付(すべて日本時間)
// ---------------------------------------------------------------------------

export function jstNow(now = new Date()): { date: string; month: string; day: number; hour: number } {
  const jst = new Date(now.getTime() + 9 * 3600 * 1000);
  const date = jst.toISOString().slice(0, 10);
  return { date, month: date.slice(0, 7), day: jst.getUTCDate(), hour: jst.getUTCHours() };
}

function jstDate(iso: string): string {
  return new Date(new Date(iso).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/** "2026-11" の次の月 → "2026-12" */
export function nextMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

/** 今日作る下書きは、何月号か(いつ作っても次の1日に配信する号) */
export function upcomingIssueMonth(now = new Date()): string {
  return nextMonth(jstNow(now).month);
}

export function lastDayOfMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** 会社の期(11月始まり)で何か月目か */
function fiscalMonthIndex(month: string): number {
  const m = Number(month.split("-")[1]);
  return ((m - 11 + 12) % 12) + 1;
}

// ---------------------------------------------------------------------------
// 保存する中身(newsletters.stats)
// ---------------------------------------------------------------------------

export interface Redline {
  at: string;
  by: string;
  feedback: string;
  before: { subject: string; body: string };
  aiNote: string;
}

export interface NewsletterMeta {
  issueMonth: string;
  data: UsageData;
  agents: {
    analysis: string;
    ideas: { title: string; who: string; how: string; why: string }[];
    writerDraft: { subject: string; body: string };
    reviewNote: string;
  };
  redlines: Redline[];
  approval: { scheduledFor: string; by: string; at: string } | null;
  deliveryError?: string;
}

export function readMeta(stats: unknown): Partial<NewsletterMeta> {
  return stats && typeof stats === "object" ? (stats as Partial<NewsletterMeta>) : {};
}

// ---------------------------------------------------------------------------
// 利用データ(社内テストのみ。採用テストのデータは使わない)
// ---------------------------------------------------------------------------

interface CourseUsage {
  name: string;
  description: string | null;
  dueDate: string | null;
  publishedOn: string;
  authorName: string | null;
  registerUrl: string;
  invitedCount: number;
  takenCount: number;
  passedCount: number;
  notPassedCount: number;
  medianMinutes: number | null;
  firstTryPassRate: number | null;
  averageAttemptsToPass: number | null;
  /** 正答率が低かった知識ポイント(全員分をまとめた数字) */
  hardestPoints: { point: string; correctRate: number }[];
}

interface ActivityWindow {
  submittedAttempts: number;
  takers: number;
  passes: number;
}

export interface UsageData {
  today: string;
  issueMonth: string;
  employeeCount: number;
  portalUrl: string;
  courses: CourseUsage[];
  activity: {
    last30Days: ActivityWindow;
    previous30Days: ActivityWindow;
    byWeekday: Record<string, number>;
    byTimeOfDay: Record<string, number>;
  };
  authoring: { draftCourseCount: number; publishedLast60Days: number };
  previousNewsletters: { sentOn: string; subject: string; body: string }[];
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export async function collectUsageData(supabase: SupabaseClient, issueMonth: string): Promise<UsageData> {
  const withDueDate = await supabase
    .from("training_courses")
    .select("id, name, description, status, created_at, published_at, author_employee_id, due_date");
  const { data: courses } = withDueDate.error
    ? await supabase
        .from("training_courses")
        .select("id, name, description, status, created_at, published_at, author_employee_id")
    : withDueDate;

  const [{ data: employees }, { data: enrollments }, { data: attempts }, { data: questions }, { data: previous }] =
    await Promise.all([
      supabase.from("employees").select("id, name"),
      supabase.from("training_enrollments").select("id, course_id"),
      supabase
        .from("training_attempts")
        .select("id, enrollment_id, passed, started_at, submitted_at")
        .eq("status", "submitted"),
      supabase.from("training_questions").select("id, course_id, group_label"),
      supabase
        .from("newsletters")
        .select("subject, body, sent_at")
        .eq("status", "sent")
        .order("sent_at", { ascending: false })
        .limit(3),
    ]);
  const { data: answers } = await supabase.from("training_answers").select("attempt_id, question_id, is_correct");

  const employeeName = new Map((employees ?? []).map((e) => [e.id, e.name as string]));
  const allCourses = (courses ?? []) as {
    id: string;
    name: string;
    description: string | null;
    status: string;
    created_at: string;
    published_at: string | null;
    author_employee_id: string | null;
    due_date?: string | null;
  }[];
  const submitted = (attempts ?? []).filter((a) => a.submitted_at) as {
    id: string;
    enrollment_id: string;
    passed: boolean | null;
    started_at: string;
    submitted_at: string;
  }[];
  const questionById = new Map(
    (questions ?? []).map((q) => [q.id as string, { courseId: q.course_id as string, label: q.group_label as string }])
  );

  const courseUsage: CourseUsage[] = allCourses
    .filter((c) => c.status === "active")
    .map((c) => {
      const enrollmentIds = new Set(
        (enrollments ?? []).filter((e) => e.course_id === c.id).map((e) => e.id as string)
      );
      const courseAttempts = submitted
        .filter((a) => enrollmentIds.has(a.enrollment_id))
        .sort((a, b) => a.submitted_at.localeCompare(b.submitted_at));

      // 受験者ごとに、何回目で合格したか
      const byEnrollment = new Map<string, boolean[]>();
      for (const a of courseAttempts) {
        byEnrollment.set(a.enrollment_id, [...(byEnrollment.get(a.enrollment_id) ?? []), !!a.passed]);
      }
      const results = Array.from(byEnrollment.values());
      const attemptsToPass = results.filter((r) => r.includes(true)).map((r) => r.indexOf(true) + 1);

      const minutes = courseAttempts
        .map((a) => (new Date(a.submitted_at).getTime() - new Date(a.started_at).getTime()) / 60000)
        .filter((m) => m > 2 && m < 180);
      const medianMinutes = median(minutes);

      // 知識ポイントごとの正答率(回答が3件以上あるものだけ)
      const attemptIds = new Set(courseAttempts.map((a) => a.id));
      const tally = new Map<string, { correct: number; total: number }>();
      for (const ans of answers ?? []) {
        if (!attemptIds.has(ans.attempt_id)) continue;
        const q = questionById.get(ans.question_id);
        if (!q) continue;
        const t = tally.get(q.label) ?? { correct: 0, total: 0 };
        t.total += 1;
        if (ans.is_correct) t.correct += 1;
        tally.set(q.label, t);
      }
      const hardestPoints = Array.from(tally.entries())
        .filter(([, t]) => t.total >= 3)
        .map(([point, t]) => ({ point, correctRate: Math.round((t.correct / t.total) * 100) }))
        .sort((a, b) => a.correctRate - b.correctRate)
        .slice(0, 2);

      const passedCount = results.filter((r) => r.includes(true)).length;
      return {
        name: c.name,
        description: c.description,
        dueDate: c.due_date ?? null,
        publishedOn: jstDate(c.published_at ?? c.created_at),
        authorName: c.author_employee_id ? employeeName.get(c.author_employee_id) ?? null : null,
        registerUrl: `${APP_URL}/training/register/${c.id}`,
        invitedCount: enrollmentIds.size,
        takenCount: results.length,
        passedCount,
        notPassedCount: enrollmentIds.size - passedCount,
        medianMinutes: medianMinutes === null ? null : Math.round(medianMinutes),
        firstTryPassRate: results.length ? Math.round((results.filter((r) => r[0]).length / results.length) * 100) : null,
        averageAttemptsToPass: attemptsToPass.length
          ? round1(attemptsToPass.reduce((s, n) => s + n, 0) / attemptsToPass.length)
          : null,
        hardestPoints,
      };
    });

  const now = Date.now();
  const enrollmentOf = (a: { enrollment_id: string }) => a.enrollment_id;
  const windowStats = (fromDaysAgo: number, toDaysAgo: number): ActivityWindow => {
    const inWindow = submitted.filter((a) => {
      const age = (now - new Date(a.submitted_at).getTime()) / 86400000;
      return age >= toDaysAgo && age < fromDaysAgo;
    });
    return {
      submittedAttempts: inWindow.length,
      takers: new Set(inWindow.map(enrollmentOf)).size,
      passes: inWindow.filter((a) => a.passed).length,
    };
  };

  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  const byWeekday: Record<string, number> = Object.fromEntries(weekdays.map((w) => [w, 0]));
  const byTimeOfDay: Record<string, number> = { "朝(〜10時)": 0, "日中(10〜17時)": 0, "夕方以降(17時〜)": 0 };
  for (const a of submitted) {
    const jst = new Date(new Date(a.submitted_at).getTime() + 9 * 3600 * 1000);
    byWeekday[weekdays[jst.getUTCDay()]] += 1;
    const h = jst.getUTCHours();
    byTimeOfDay[h < 10 ? "朝(〜10時)" : h < 17 ? "日中(10〜17時)" : "夕方以降(17時〜)"] += 1;
  }

  return {
    today: jstNow().date,
    issueMonth,
    employeeCount: (employees ?? []).length,
    portalUrl: `${APP_URL}/training/portal`,
    courses: courseUsage,
    activity: {
      last30Days: windowStats(30, 0),
      previous30Days: windowStats(60, 30),
      byWeekday,
      byTimeOfDay,
    },
    authoring: {
      draftCourseCount: allCourses.filter((c) => c.status === "draft").length,
      publishedLast60Days: allCourses.filter(
        (c) => c.status === "active" && now - new Date(c.published_at ?? c.created_at).getTime() < 60 * 86400000
      ).length,
    },
    previousNewsletters: (previous ?? []).map((n) => ({
      sentOn: n.sent_at ? jstDate(n.sent_at) : "",
      subject: n.subject,
      body: n.body,
    })),
  };
}

/** これまでの赤入れ(新しい順)。次の号を書くときに、同じ指摘を受けないよう全エージェントが読む */
async function collectPastRedlines(supabase: SupabaseClient): Promise<string[]> {
  const { data } = await supabase
    .from("newsletters")
    .select("stats")
    .order("created_at", { ascending: false })
    .limit(12);
  return (data ?? [])
    .flatMap((n) => readMeta(n.stats).redlines ?? [])
    .map((r) => r.feedback)
    .slice(0, 15);
}

// ---------------------------------------------------------------------------
// エージェントに共通で渡す知識
// ---------------------------------------------------------------------------

const COMPANY = `アルファグループは、FP(ファイナンシャルプランナー)と不動産の会社です。会社の期は11月に始まり、10月で終わります。`;

/** 社内テストの仕組みでできること(発想担当・文章担当が「事実」として使ってよい範囲) */
const FEATURES = `社内テストの仕組みでできること:
- 受ける: 配布中のテストは、各テストの登録用リンクから会社のメールアドレスで登録してすぐ受験できる。スマホでも受けられる。
- 合格: 正答率80%以上で合格。合格するまで何度でも受験でき、問題は毎回入れ替わる。答え合わせで解説を読んで学べる。
- 作る: 社員用ページ(ポータル)で、PDFの資料を読み込ませると、AIと一緒に社内テストを作れる。AIが知識ポイントを抜き出し、問題と解説の案を出すので、作る人は確認・修正するだけ。
- 配る: 作った人がそのまま配布を始められる。ほかの社員に内容の確認(第三者チェック)を頼むこともできる。
- 振り返る: 作った人は、受験結果のページで、どの問題がよく間違えられているかを見られる。
- 期限: 管理者がテストに受験期限を設定できる。
- 向いている題材: 提携先の商品知識、税制改正や新制度、研修・勉強会の後の確認、新しく入った人の基礎知識、マニュアルや社内ルールの改訂、物件・エリアの知識、よくあるお客様の質問への答え方。
- 注意: 社内専用。社外の人への配布や、問題の社外への共有はしない。お客様の個人情報が入った資料は読み込ませない。`;

const PRIVACY = `全社員宛てのメールなので、必ず守ること:
- 個人の点数、受験した人・まだ合格していない人の名前は書かない。テストを作った人の名前は、感謝や紹介としてだけ書いてよい。
- お客様や取引先の実名・個人が特定できる事例は書かない。
- 採用や候補者のことには触れない。
- 数字・テスト名・日付・リンクは、利用データにあるものだけを使う。データにないことを作らない。`;

/** 月ごとの、FP・不動産の仕事の季節感(仕上げ担当が使う) */
const SEASONS: Record<number, string> = {
  1: "新年。確定申告の準備が始まる。新NISAの年間投資枠がリセット。不動産は春の繁忙期の準備。",
  2: "確定申告の受付開始(2月中旬〜3月中旬)。医療費控除・住宅ローン控除1年目の相談が増える。不動産は繁忙期の入口。",
  3: "確定申告の締め切り。年度末で引越し・住み替えのピーク。期の折り返しが見えてくる。",
  4: "新年度。新しい制度・税制改正の施行が多い。新社会人や転勤の相談。固定資産税の評価替え・課税明細の時期が近い。",
  5: "固定資産税の納税通知書が届く。ゴールデンウィーク明けで気持ちを入れ直す時期。",
  6: "住民税の決定通知。夏のボーナス。期の後半戦(上期の終わり)。",
  7: "路線価の公表(相続・贈与の相談のきっかけ)。夏のボーナスの使い道。",
  8: "お盆で家族が集まり、相続や住まいの話が出やすい。夏休みで少し時間がとれる。",
  9: "基準地価の公表。秋の住み替えシーズン。期末まで残り2か月。",
  10: "期末。1年の振り返り。年末調整の書類が届き始める。ふるさと納税の駆け込み前。",
  11: "期初(新しい期のスタート)。今期の目標づくり。年末調整の準備、ふるさと納税の駆け込み、住宅ローン控除の年末残高。",
  12: "年末。年末調整、ふるさと納税の締め切り、冬のボーナス。1年の総まとめと、来年の計画。",
};

function seasonContext(issueMonth: string): string {
  const m = Number(issueMonth.split("-")[1]);
  return `このメールは${m}月1日に配信する${m}月号です(会社の期では${fiscalMonthIndex(issueMonth)}か月目)。
${m}月の季節感: ${SEASONS[m]}`;
}

const FOOTER = `${SENDER_NAME}より
(このメールはAIが作り、社内で内容を確認してからお送りしています)`;

const WRITING_RULES = `メールの書き方:
- 差出人は「${SENDER_NAME}」。親しみやすく、少しお茶目な同僚のような語り口。ただし社会人として失礼のない、です・ます調。
- 構成の目安: 季節のひとこと → 今月の「楽しく使えそうな使い方」1〜2個 → 【配布中のテスト】(テスト名、期限があれば期限、登録用リンク、目安時間) → 社員用ページ(ポータル)の案内とリンク → 結びのひとこと。
- 本文は700字程度まで。短い文で書く。見出しは【】で囲む。Markdown記号(#、*、表)は使わない。
- 過去に送ったメールと同じ話の繰り返しは避ける。
- 最後は次の2行で終える:
${FOOTER}`;

// ---------------------------------------------------------------------------
// エージェント
// ---------------------------------------------------------------------------

async function runAgent<T>(params: {
  system: string;
  prompt: string;
  schema: Record<string, unknown>;
  effort: "low" | "medium" | "high";
}): Promise<T> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new NewsletterError("ANTHROPIC_API_KEY が設定されていません。");
  const client = new Anthropic({ apiKey });

  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 8000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: params.system,
    output_config: { effort: params.effort, format: { type: "json_schema", schema: params.schema } },
    messages: [{ role: "user", content: params.prompt }],
  });
  const message = await stream.finalMessage();

  if (message.stop_reason === "refusal") {
    throw new NewsletterError("AIが下書きの作成を断りました。もう一度お試しください。");
  }
  const text = message.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new NewsletterError("AIの出力を読み取れませんでした: " + text.slice(0, 200));
  }
}

const mailSchema = {
  type: "object",
  properties: {
    subject: { type: "string", description: "件名。30字程度まで" },
    body: { type: "string", description: "本文(プレーンテキスト。改行で区切る)" },
  },
  required: ["subject", "body"],
  additionalProperties: false,
};

const reviewSchema = {
  type: "object",
  properties: {
    subject: { type: "string", description: "仕上げた件名" },
    body: { type: "string", description: "仕上げた本文" },
    note: {
      type: "string",
      description: "田中さんへのメモ。どこを直したか、季節の話題に何を選んだか、人間味の確認結果、田中さんに見てほしい点。箇条書き(「・」始まり)で5行程度",
    },
  },
  required: ["subject", "body", "note"],
  additionalProperties: false,
};

/** エージェント1: 分析担当 */
async function analyze(data: UsageData): Promise<string> {
  const result = await runAgent<{ analysis: string }>({
    effort: "medium",
    system: `${COMPANY}
あなたは社内テストの利用状況を読み解く「分析担当」です。
渡された利用データから、社内テストがどんなふうに使われているか(使われていないか)を分析し、次の担当(使い方を考える担当)へ渡すメモを書きます。
- 数字はデータにあるものだけを使い、根拠の数字を添える。
- 伸びている点、止まっている点、つまずいている知識ポイント、受けられている曜日・時間帯、作る側の動きなどを見る。
- 個人の名前は書かない(テストを作った人の名前を除く)。
- 箇条書き(「・」始まり)で6〜10行。最後に「いちばん伝えたいこと」を1行。`,
    prompt: `利用データ:\n${JSON.stringify(data, null, 2)}`,
    schema: {
      type: "object",
      properties: { analysis: { type: "string" } },
      required: ["analysis"],
      additionalProperties: false,
    },
  });
  return result.analysis.trim();
}

/** エージェント2: 発想担当 */
async function ideate(data: UsageData, analysis: string): Promise<NewsletterMeta["agents"]["ideas"]> {
  const result = await runAgent<{ ideas: NewsletterMeta["agents"]["ideas"] }>({
    effort: "medium",
    system: `${COMPANY}
あなたは「使い方を考える担当」です。分析担当のメモと、社内テストの仕組みでできることをもとに、社員が「やってみたい」と思える具体的な使い方を考えます。
${FEATURES}
- 実在の社員・お客様・取引先の名前は出さない。「FP担当」「不動産の営業担当」「事務スタッフ」「新しく入った人」「チーム」のように役割で書く。
- 機能一覧にないことはできると言わない。
- 分析で見えた課題(止まっている、つまずいている等)に効く案を優先する。
- 3〜4個。それぞれ、タイトル・だれが・どう使う・うれしいこと、を短く。`,
    prompt: `${seasonContext(data.issueMonth)}

分析担当のメモ:
${analysis}

配布中のテスト:
${JSON.stringify(data.courses.map((c) => ({ name: c.name, description: c.description })), null, 2)}`,
    schema: {
      type: "object",
      properties: {
        ideas: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              who: { type: "string" },
              how: { type: "string" },
              why: { type: "string" },
            },
            required: ["title", "who", "how", "why"],
            additionalProperties: false,
          },
        },
      },
      required: ["ideas"],
      additionalProperties: false,
    },
  });
  return result.ideas;
}

/** エージェント3: 文章担当 */
async function write(
  data: UsageData,
  ideas: NewsletterMeta["agents"]["ideas"],
  pastRedlines: string[]
): Promise<{ subject: string; body: string }> {
  const result = await runAgent<{ subject: string; body: string }>({
    effort: "medium",
    system: `${COMPANY}
あなたは「文章担当」です。使い方を考える担当の案から、今月いちばん響きそうなものを1〜2個選び、社員が「ちょっと試してみようかな」と思える、楽しい月1回のお知らせメールに書きます。
宛先は全社員が入ったメーリングリストです。
${FEATURES}
${PRIVACY}
${WRITING_RULES}
${pastRedlines.length ? `これまでに田中さんから入った赤入れ(同じ指摘を受けないように):\n${pastRedlines.map((r) => `- ${r}`).join("\n")}` : ""}`,
    prompt: `${seasonContext(data.issueMonth)}

使い方の案:
${JSON.stringify(ideas, null, 2)}

利用データ(テスト名・期限・リンク・目安時間はここから使う):
${JSON.stringify({ courses: data.courses, portalUrl: data.portalUrl, previousNewsletters: data.previousNewsletters }, null, 2)}`,
    schema: mailSchema,
  });
  return { subject: result.subject.trim(), body: result.body.trim() };
}

/** エージェント4: 仕上げ担当(季節感と人間味) */
async function polish(
  data: UsageData,
  draft: { subject: string; body: string },
  pastRedlines: string[]
): Promise<{ subject: string; body: string; note: string }> {
  const result = await runAgent<{ subject: string; body: string; note: string }>({
    effort: "medium",
    system: `${COMPANY}
あなたは「仕上げ担当」です。文章担当の下書きを、次の観点で確認して仕上げます。
1. 季節: 配信月の季節感(会社の期の何か月目か、FP・不動産の仕事の時期)に合った使い方の提案やひとことが入っているか。なければ足す。
2. 人間味: 読んだ人が「AIの定型文」ではなく「同僚から届いたメール」と感じるか。具体的な場面、ちょっとした共感やねぎらい、くすっとできる一言が入っているか。硬い・宣伝っぽい・決まり文句だらけの部分は書き直す。ただし、ふざけすぎない。
3. 正確さと配慮: 下の約束ごとを守っているか。テスト名・リンク・日付・数字が利用データと一致しているか。
直したうえで、田中さんへのメモを残してください。
${FEATURES}
${PRIVACY}
${WRITING_RULES}
${pastRedlines.length ? `これまでに田中さんから入った赤入れ(必ず反映する):\n${pastRedlines.map((r) => `- ${r}`).join("\n")}` : ""}`,
    prompt: `${seasonContext(data.issueMonth)}

文章担当の下書き:
件名: ${draft.subject}
${draft.body}

利用データ:
${JSON.stringify({ courses: data.courses, portalUrl: data.portalUrl }, null, 2)}`,
    schema: reviewSchema,
  });
  return { subject: result.subject.trim(), body: result.body.trim(), note: result.note.trim() };
}

/** 赤入れを受けて直す(仕上げ担当が対応する) */
async function applyRedline(
  data: UsageData,
  current: { subject: string; body: string },
  feedback: string,
  history: Redline[]
): Promise<{ subject: string; body: string; note: string }> {
  const result = await runAgent<{ subject: string; body: string; note: string }>({
    effort: "medium",
    system: `${COMPANY}
あなたは「仕上げ担当」です。田中さんから、お知らせメールの下書きに赤入れ(修正指示)が返ってきました。
指示どおりに直してください。指示されていない部分は、なるべくそのまま残します。
直したら、田中さんへのメモ(何をどう直したか。指示の解釈に迷った点があればそれも)を残してください。
${PRIVACY}
${WRITING_RULES}`,
    prompt: `${seasonContext(data.issueMonth)}

${history.length ? `この号でこれまでに入った赤入れ(引き続き守る):\n${history.map((r) => `- ${r.feedback}`).join("\n")}\n\n` : ""}今の下書き:
件名: ${current.subject}
${current.body}

今回の赤入れ:
${feedback}

利用データ:
${JSON.stringify({ courses: data.courses, portalUrl: data.portalUrl }, null, 2)}`,
    schema: reviewSchema,
  });
  return { subject: result.subject.trim(), body: result.body.trim(), note: result.note.trim() };
}

// ---------------------------------------------------------------------------
// 下書きの作成・赤入れ・承認・配信
// ---------------------------------------------------------------------------

/** その号の下書き(取りやめ・送信済みも含む)があるか */
export async function findIssue(supabase: SupabaseClient, issueMonth: string) {
  const { data } = await supabase
    .from("newsletters")
    .select("id, status, subject, body, stats, created_at")
    .eq("stats->>issueMonth", issueMonth)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as { id: string; status: string; subject: string; body: string; stats: unknown } | null;
}

/** 4人のエージェントで下書きを作って保存する */
export async function createNewsletterDraft(
  supabase: SupabaseClient,
  createdBy: string,
  issueMonth = upcomingIssueMonth()
): Promise<{ id: string; subject: string; body: string; meta: NewsletterMeta }> {
  const data = await collectUsageData(supabase, issueMonth);
  const pastRedlines = await collectPastRedlines(supabase);

  const analysis = await analyze(data);
  const ideas = await ideate(data, analysis);
  const writerDraft = await write(data, ideas, pastRedlines);
  const final = await polish(data, writerDraft, pastRedlines);

  const meta: NewsletterMeta = {
    issueMonth,
    data,
    agents: { analysis, ideas, writerDraft, reviewNote: final.note },
    redlines: [],
    approval: null,
  };

  // 同じ号の確認待ちの下書きは、新しい下書きに置き換える
  await supabase
    .from("newsletters")
    .update({ status: "discarded" })
    .eq("status", "draft")
    .eq("stats->>issueMonth", issueMonth);

  const { data: created, error } = await supabase
    .from("newsletters")
    .insert({ subject: final.subject, body: final.body, stats: meta, created_by: createdBy })
    .select("id, subject, body")
    .single();
  if (error || !created) {
    throw new NewsletterError("下書きの保存に失敗しました: " + (error?.message ?? ""));
  }
  return { ...created, meta };
}

async function loadDraft(supabase: SupabaseClient, id: string) {
  const { data } = await supabase
    .from("newsletters")
    .select("id, status, subject, body, stats")
    .eq("id", id)
    .maybeSingle();
  if (!data || data.status !== "draft") {
    throw new NewsletterError("このメールは送信済みか、取りやめ済みです。");
  }
  return { ...data, meta: readMeta(data.stats) } as {
    id: string;
    subject: string;
    body: string;
    meta: Partial<NewsletterMeta>;
  };
}

/** 赤入れを受けて AI が直し、直す前の文面を履歴に残す。内容が変わるので承認は取り消す */
export async function reviseNewsletter(
  supabase: SupabaseClient,
  id: string,
  feedback: string,
  by: string
): Promise<{ subject: string; body: string; note: string }> {
  const draft = await loadDraft(supabase, id);
  const issueMonth = draft.meta.issueMonth ?? upcomingIssueMonth();
  const data = draft.meta.data ?? (await collectUsageData(supabase, issueMonth));
  const history = draft.meta.redlines ?? [];

  const revised = await applyRedline(data, { subject: draft.subject, body: draft.body }, feedback, history);
  const redline: Redline = {
    at: new Date().toISOString(),
    by,
    feedback,
    before: { subject: draft.subject, body: draft.body },
    aiNote: revised.note,
  };
  const { error } = await supabase
    .from("newsletters")
    .update({
      subject: revised.subject,
      body: revised.body,
      stats: { ...draft.meta, issueMonth, data, redlines: [...history, redline], approval: null },
    })
    .eq("id", id)
    .eq("status", "draft");
  if (error) throw new NewsletterError("保存に失敗しました: " + error.message);
  return revised;
}

/** 手で直した件名・本文を保存する。内容が変わるので承認は取り消す */
export async function saveNewsletterEdit(
  supabase: SupabaseClient,
  id: string,
  subject: string,
  body: string
): Promise<void> {
  const draft = await loadDraft(supabase, id);
  const { error } = await supabase
    .from("newsletters")
    .update({ subject, body, stats: { ...draft.meta, approval: null } })
    .eq("id", id)
    .eq("status", "draft");
  if (error) throw new NewsletterError("保存に失敗しました: " + error.message);
}

/** 承認する(配信日は号の1日。すでに過ぎていれば今日) */
export async function approveNewsletter(
  supabase: SupabaseClient,
  id: string,
  by: string
): Promise<{ scheduledFor: string }> {
  const draft = await loadDraft(supabase, id);
  const issueMonth = draft.meta.issueMonth ?? upcomingIssueMonth();
  const today = jstNow().date;
  const firstDay = `${issueMonth}-01`;
  const scheduledFor = firstDay < today ? today : firstDay;
  const { error } = await supabase
    .from("newsletters")
    .update({
      stats: { ...draft.meta, issueMonth, approval: { scheduledFor, by, at: new Date().toISOString() } },
    })
    .eq("id", id)
    .eq("status", "draft");
  if (error) throw new NewsletterError("承認に失敗しました: " + error.message);
  return { scheduledFor };
}

export async function cancelApproval(supabase: SupabaseClient, id: string): Promise<void> {
  const draft = await loadDraft(supabase, id);
  const { error } = await supabase
    .from("newsletters")
    .update({ stats: { ...draft.meta, approval: null } })
    .eq("id", id)
    .eq("status", "draft");
  if (error) throw new NewsletterError("取り消しに失敗しました: " + error.message);
}

/**
 * 全社員のメーリングリストへ配信する。
 * 二重送信を防ぐため、先に status を draft → sent に切り替えてから送り、失敗したら draft に戻す。
 */
export async function deliverNewsletter(
  supabase: SupabaseClient,
  id: string,
  sentBy: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: claimed, error } = await supabase
    .from("newsletters")
    .update({ status: "sent", sent_at: new Date().toISOString(), sent_by: sentBy })
    .eq("id", id)
    .eq("status", "draft")
    .select("id, subject, body, stats")
    .maybeSingle();
  if (error) return { ok: false, error: "送信の準備に失敗しました: " + error.message };
  if (!claimed) return { ok: false, error: "このメールは送信済みか、取りやめ済みです。" };

  const result = await sendNewsletterEmail({
    to: NEWSLETTER_TO,
    replyTo: NEWSLETTER_REVIEWER,
    subject: claimed.subject,
    html: newsletterBodyToHtml(claimed.body),
  });
  if (!result.ok) {
    await supabase
      .from("newsletters")
      .update({
        status: "draft",
        sent_at: null,
        sent_by: null,
        stats: { ...readMeta(claimed.stats), deliveryError: result.error },
      })
      .eq("id", id);
  }
  return result;
}

// ---------------------------------------------------------------------------
// 田中さんへの連絡
// ---------------------------------------------------------------------------

export const REVIEW_URL = `${APP_URL}/admin/newsletter`;

type ReviewerNotice = "draft" | "reminder" | "not_approved" | "delivered" | "delivery_failed";

/** 下書きができた・承認待ち・配信した、などを田中さんに知らせる */
export async function notifyReviewer(
  kind: ReviewerNotice,
  newsletter: { subject: string; body: string; stats: unknown },
  detail?: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const meta = readMeta(newsletter.stats);
  const issue = meta.issueMonth ? issueLabel(meta.issueMonth) : "お知らせメール";
  const sendDay = meta.issueMonth ? jpDay(`${meta.issueMonth}-01`) : "1日";

  const headings: Record<ReviewerNotice, { subject: string; lead: string }> = {
    draft: {
      subject: `【赤入れのお願い】${issue}の社内テストお知らせメール(${sendDay}配信予定)`,
      lead: `田中さん、${issue}の下書きができました。4人のAI(分析・発想・文章・仕上げ)で作っています。
管理画面で赤入れ(直してほしいことを書く)をすると、AIが直して返します。手で直すこともできます。
よければ「承認」を押してください。${sendDay}の朝9時に all_alpha(社員全員)へ自動で配信します。`,
    },
    reminder: {
      subject: `【承認待ち】${issue}の社内テストお知らせメール(${sendDay}配信予定)`,
      lead: `田中さん、${issue}の下書きがまだ承認されていません。${sendDay}の朝9時に配信するには、それまでに管理画面で「承認」を押してください。`,
    },
    not_approved: {
      subject: `【未配信】${issue}の社内テストお知らせメールは、まだ承認されていません`,
      lead: `田中さん、今朝の配信時刻になりましたが、${issue}は承認されていないので配信していません。
管理画面で「承認」を押すと、その場で配信します。今月は送らない場合は「取りやめる」を押してください。`,
    },
    delivered: {
      subject: `【配信しました】${issue}の社内テストお知らせメール`,
      lead: `田中さん、${issue}を all_alpha(社員全員)へ配信しました。`,
    },
    delivery_failed: {
      subject: `【配信できませんでした】${issue}の社内テストお知らせメール`,
      lead: `田中さん、${issue}の配信に失敗しました。原因: ${detail ?? "不明"}
原因を解消したあと、管理画面で「今すぐ全社員に送る」を押すと配信できます。`,
    },
  };
  const h = headings[kind];
  const note =
    kind === "draft" && meta.agents?.reviewNote
      ? `<p><strong>仕上げ担当AIからのメモ</strong></p><div style="font-size:13px;color:#555">${escapeHtml(meta.agents.reviewNote).replace(/\n/g, "<br>")}</div>`
      : "";

  return sendToNewsletterReviewer({
    to: NEWSLETTER_REVIEWER,
    subject: h.subject,
    html: `
      <p>${escapeHtml(h.lead).replace(/\n/g, "<br>")}</p>
      <p><a href="${REVIEW_URL}">${REVIEW_URL}</a></p>
      ${note}
      <hr>
      <p><strong>件名: ${escapeHtml(newsletter.subject)}</strong></p>
      ${newsletterBodyToHtml(newsletter.body)}
      <hr>
      <p style="font-size:12px;color:#888">${SENDER_NAME}</p>
    `,
  });
}

// ---------------------------------------------------------------------------
// メール本文の HTML 化
// ---------------------------------------------------------------------------

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** プレーンテキストの本文を、リンク付きの簡単な HTML メールにする */
export function newsletterBodyToHtml(body: string): string {
  const linked = escapeHtml(body).replace(
    /https?:\/\/[^\s<]+/g,
    (url) => `<a href="${url}">${url}</a>`
  );
  return `<div style="font-size:14px;line-height:1.8">${linked.replace(/\n/g, "<br>")}</div>`;
}

/** "2026-11" → "11月号"、"2026-11-01" → "11月1日" */
export function issueLabel(issueMonth: string): string {
  return `${Number(issueMonth.split("-")[1])}月号`;
}
export function jpDay(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${m}月${d}日`;
}
