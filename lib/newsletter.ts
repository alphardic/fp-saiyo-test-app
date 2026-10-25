import Anthropic from "@anthropic-ai/sdk";
import { SupabaseClient } from "@supabase/supabase-js";

/**
 * 社内テストのお知らせメール。
 * 利用データを集めて AI が下書きを作り、最高権限者(田中さん)が管理画面で確認してから
 * 全社員のメーリングリストへ送る。全員宛てなので、個人の点数・未合格者の名前・採用候補者の情報は扱わない。
 */

export const NEWSLETTER_TO = "all_alpha@alpha-fp.com";
export const NEWSLETTER_REVIEWER = "tanaka@alpha-fp.com";
export const APP_URL = "https://fp-saiyo-test-app.tanaka-a6c.workers.dev";

const MODEL = "claude-opus-5-5";

export class NewsletterError extends Error {}

interface CourseStat {
  name: string;
  description: string | null;
  dueDate: string | null;
  publishedOn: string;
  authorName: string | null;
  registerUrl: string;
  invitedCount: number;
  passedCount: number;
  notPassedCount: number;
  medianMinutes: number | null;
}

export interface NewsletterStats {
  today: string;
  employeeCount: number;
  portalUrl: string;
  courses: CourseStat[];
  draftCourseCount: number;
  previousNewsletters: { sentOn: string; subject: string; body: string }[];
}

function jstDate(iso: string): string {
  return new Date(new Date(iso).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/** AI に渡す利用データを集める(社内テストのみ。採用テストのデータは使わない) */
export async function collectNewsletterStats(supabase: SupabaseClient): Promise<NewsletterStats> {
  const withDueDate = await supabase
    .from("training_courses")
    .select("id, name, description, status, created_at, published_at, author_employee_id, due_date");
  const { data: courses } = withDueDate.error
    ? await supabase
        .from("training_courses")
        .select("id, name, description, status, created_at, published_at, author_employee_id")
    : withDueDate;

  const [{ data: employees }, { data: enrollments }, { data: attempts }, { data: previous }] =
    await Promise.all([
      supabase.from("employees").select("id, name"),
      supabase.from("training_enrollments").select("id, course_id"),
      supabase
        .from("training_attempts")
        .select("enrollment_id, status, passed, started_at, submitted_at")
        .eq("status", "submitted"),
      supabase
        .from("newsletters")
        .select("subject, body, sent_at")
        .eq("status", "sent")
        .order("sent_at", { ascending: false })
        .limit(3),
    ]);

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

  const courseStats: CourseStat[] = allCourses
    .filter((c) => c.status === "active")
    .map((c) => {
      const enrollmentIds = new Set(
        (enrollments ?? []).filter((e) => e.course_id === c.id).map((e) => e.id as string)
      );
      const courseAttempts = (attempts ?? []).filter((a) => enrollmentIds.has(a.enrollment_id));
      const passedEnrollments = new Set(
        courseAttempts.filter((a) => a.passed).map((a) => a.enrollment_id as string)
      );
      const minutes = courseAttempts
        .filter((a) => a.submitted_at)
        .map((a) => (new Date(a.submitted_at).getTime() - new Date(a.started_at).getTime()) / 60000)
        .filter((m) => m > 2 && m < 180);
      const medianMinutes = median(minutes);
      return {
        name: c.name,
        description: c.description,
        dueDate: c.due_date ?? null,
        publishedOn: jstDate(c.published_at ?? c.created_at),
        authorName: c.author_employee_id ? employeeName.get(c.author_employee_id) ?? null : null,
        registerUrl: `${APP_URL}/training/register/${c.id}`,
        invitedCount: enrollmentIds.size,
        passedCount: passedEnrollments.size,
        notPassedCount: enrollmentIds.size - passedEnrollments.size,
        medianMinutes: medianMinutes === null ? null : Math.round(medianMinutes),
      };
    });

  return {
    today: jstDate(new Date().toISOString()),
    employeeCount: (employees ?? []).length,
    portalUrl: `${APP_URL}/training/portal`,
    courses: courseStats,
    draftCourseCount: allCourses.filter((c) => c.status === "draft").length,
    previousNewsletters: (previous ?? []).map((n) => ({
      sentOn: n.sent_at ? jstDate(n.sent_at) : "",
      subject: n.subject,
      body: n.body,
    })),
  };
}

const SYSTEM = `あなたはFP事務所「アルファFP」の社内向けメールの書き手です。
社内テストの仕組みを、もっと社員に使ってもらうためのお知らせメールの下書きを作ります。
宛先は全社員が入ったメーリングリストです。下書きは送信前に田中さんが確認・修正します。

社内テストの仕組み(事実として使ってよいこと):
- 配布中のテストは、各テストの登録用リンクから、会社のメールアドレスで登録してすぐ受験できる。
- 正答率80%以上で合格。合格するまで何度でも受験でき、答え合わせで解説を読んで学べる。
- 社員用ページでは、PDFの資料を読み込ませると、AIと一緒に社内テストを作って配布できる。
  使える場面: 提携先の商品知識、税制改正や新制度の理解度チェック、研修・勉強会の後の確認、新しく入った人の基礎知識、マニュアル改訂の周知など。
- 社内専用。社外の人への配布や、テスト・問題の社外への共有はしない。お客様の個人情報が入った資料は読み込ませない。

必ず守ること:
- 数字・テスト名・日付・リンクは、渡された利用データにあるものだけを使う。データにないことを作らない。
- 個人の点数、受験した人・まだ合格していない人の名前は書かない(全員宛てのため)。
  テストを作った人の名前は、感謝や紹介として書いてよい。
- 採用や候補者のことには触れない。
- 過去に送ったメールと同じ話の繰り返しは避け、毎回ちがう使い方のコツや事例を1つ入れる。
- 構成: 冒頭のひとこと → 【配布中のテスト】(期限があれば期限、登録用リンク、目安時間) → 【使い方のコツ】または【事例】を1つ → 社員用ページの案内(リンク)。
- 本文は600字程度まで。です・ます調で、短い文で書く。見出しは【】で囲む。Markdown記号(#、*、表)は使わない。
- 最後の行は「(このメールはAIが下書きし、田中が確認して送っています)」にする。`;

const schema = {
  type: "object",
  properties: {
    subject: { type: "string", description: "件名。【社内テスト】で始め、30字程度まで" },
    body: { type: "string", description: "本文(プレーンテキスト。改行で区切る)" },
  },
  required: ["subject", "body"],
  additionalProperties: false,
};

/** 利用データから、件名と本文の下書きを AI に作らせる */
export async function draftNewsletter(stats: NewsletterStats): Promise<{ subject: string; body: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new NewsletterError("ANTHROPIC_API_KEY が設定されていません。");
  const client = new Anthropic({ apiKey });

  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 8000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    output_config: { effort: "medium", format: { type: "json_schema", schema } },
    messages: [
      {
        role: "user",
        content: `次の利用データをもとに、お知らせメールの下書きを作ってください。\n\n${JSON.stringify(stats, null, 2)}`,
      },
    ],
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
    const parsed = JSON.parse(text) as { subject: string; body: string };
    return { subject: parsed.subject.trim(), body: parsed.body.trim() };
  } catch {
    throw new NewsletterError("AIの出力を読み取れませんでした: " + text.slice(0, 200));
  }
}

/**
 * 下書きを作って保存する。まだ送っていない下書きがあれば新しくは作らず、それを返す
 * (確認待ちの下書きが何通も溜まらないようにするため)。
 */
export async function createNewsletterDraft(
  supabase: SupabaseClient,
  createdBy: string
): Promise<{ id: string; subject: string; body: string; reused: boolean }> {
  const { data: pending } = await supabase
    .from("newsletters")
    .select("id, subject, body")
    .eq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (pending) return { ...pending, reused: true };

  const stats = await collectNewsletterStats(supabase);
  const draft = await draftNewsletter(stats);

  const { data: created, error } = await supabase
    .from("newsletters")
    .insert({ subject: draft.subject, body: draft.body, stats, created_by: createdBy })
    .select("id, subject, body")
    .single();
  if (error || !created) {
    throw new NewsletterError("下書きの保存に失敗しました: " + (error?.message ?? ""));
  }
  return { ...created, reused: false };
}

function escapeHtml(text: string): string {
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
