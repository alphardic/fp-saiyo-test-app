import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-opus-5-5";
const CHOICE_LETTERS = ["A", "B", "C", "D"] as const;

export interface OutlinePoint {
  key: string;
  label: string;
  summary: string;
}

/** DBに保存する形の問題(training_questions と同じ形。choices は "A. ..." 形式) */
export interface QuestionDraft {
  question: string;
  choices: string[];
  answer: string;
  explanation: string;
}

export interface CourseContext {
  name: string;
  description: string | null;
  targetAudience: string | null;
  sourceNotes: string;
}

export class AuthoringAIError extends Error {}

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new AuthoringAIError("ANTHROPIC_API_KEY が設定されていません。");
  }
  return new Anthropic({ apiKey });
}

/**
 * 構造化出力(JSONスキーマ)でClaudeを呼び出し、パース済みのオブジェクトを返す。
 * 安全分類器で断られた場合は既定のフォールバックモデルで自動的に再実行される。
 */
async function callJson<T>(params: {
  system: string;
  content: Anthropic.Beta.BetaContentBlockParam[];
  schema: Record<string, unknown>;
  effort: "low" | "medium" | "high";
  maxTokens: number;
}): Promise<T> {
  const client = getClient();
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: params.maxTokens,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: params.system,
    output_config: {
      effort: params.effort,
      format: { type: "json_schema", schema: params.schema },
    },
    messages: [{ role: "user", content: params.content }],
  });
  const message = await stream.finalMessage();

  if (message.stop_reason === "refusal") {
    throw new AuthoringAIError("AIが処理を断りました。内容を見直して再実行してください。");
  }
  if (message.stop_reason === "max_tokens") {
    throw new AuthoringAIError("AIの出力が長すぎて途中で切れました。対象を減らして再実行してください。");
  }
  const text = message.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new AuthoringAIError("AIの出力を読み取れませんでした: " + text.slice(0, 200));
  }
}

function rulesBlock(rules: string[]): string {
  if (rules.length === 0) return "(まだありません)";
  return rules.map((r, i) => `${i + 1}. ${r}`).join("\n");
}

function courseBlock(course: CourseContext): string {
  return `# テストの概要
テスト名: ${course.name}
目的・説明: ${course.description || "(未記入)"}
受験対象者: ${course.targetAudience || "(未記入)"}

# 資料の要点ノート
${course.sourceNotes || "(資料なし)"}`;
}

const SYSTEM_BASE = `あなたはFP(ファイナンシャルプランナー)事務所「アルファFP」の社内認定テストを作る作問担当です。
社員が実務で顧客対応するために必要な知識を、4択問題で確認するテストを作ります。

テストの仕組み:
- テストは複数の「知識ポイント」で構成され、知識ポイントごとに問題文・選択肢の違う複数パターンを用意する。
- 受験のたびに知識ポイントごとにランダムで1パターンだけ出題し、順番もシャッフルする(カンニング対策)。
  そのため、各設問はほかの設問を見ずに単独で答えられなければならない。
- 正答率80%以上で合格。合格するまで何度でも再受験できる。答え合わせで解説を読んで学ぶ。

以下の「作問ルール」は、これまで上司や社員がテストを見て指摘してきた内容をまとめたものです。
すべての問題で必ず守ってください。`;

const questionSchema = {
  type: "object",
  properties: {
    question: { type: "string", description: "問題文。前提条件を含め単独で答えられる文" },
    choices: {
      type: "array",
      items: { type: "string" },
      description: "4つの選択肢。先頭に「A.」などの記号は付けない",
    },
    answer_index: { type: "integer", description: "正解の選択肢の位置(0〜3)" },
    explanation: {
      type: "string",
      description: "解説。正解の根拠と、紛らわしい誤答がなぜ誤りかを含める",
    },
  },
  required: ["question", "choices", "answer_index", "explanation"],
  additionalProperties: false,
} as const;

interface RawQuestion {
  question: string;
  choices: string[];
  answer_index: number;
  explanation: string;
}

function toDraft(raw: RawQuestion): QuestionDraft {
  const choices = raw.choices.slice(0, 4).map((c) => c.replace(/^[A-DＡ-Ｄ][.．、:：]\s*/, "").trim());
  if (choices.length !== 4) {
    throw new AuthoringAIError("AIが4つの選択肢を作れませんでした。再実行してください。");
  }
  const idx = Math.min(3, Math.max(0, Math.round(raw.answer_index)));
  return {
    question: raw.question.trim(),
    choices: choices.map((c, i) => `${CHOICE_LETTERS[i]}. ${c}`),
    answer: CHOICE_LETTERS[idx],
    explanation: raw.explanation.trim(),
  };
}

function questionForPrompt(q: QuestionDraft): string {
  return `問題文: ${q.question}\n選択肢:\n${q.choices.join("\n")}\n正解: ${q.answer}\n解説: ${q.explanation}`;
}

/**
 * アップロードされたPDF資料を読み、作問に使う「要点ノート」(事実・数字・条件の箇条書き)にまとめる。
 */
export async function extractSourceNotes(params: {
  fileName: string;
  pdfBase64: string;
}): Promise<string> {
  const result = await callJson<{ notes: string }>({
    system:
      "あなたは社内テストの作問準備をするアシスタントです。資料から、テスト問題の根拠になる事実を漏れなく抜き出します。",
    content: [
      {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: params.pdfBase64 },
      },
      {
        type: "text",
        text: `資料「${params.fileName}」を読み、社内テストの問題を作るための「要点ノート」を作ってください。

- 見出しごとに箇条書きでまとめる
- 数字は単位・条件・時点・対象範囲(地域、税込/税抜、坪単価/総額など)とセットで正確に書き写す
- 制度の要件、商品の仕様・性能値、他社や一般水準との比較、例外や注意点を優先して残す
- 資料に書かれていないことは補わない
- 宣伝文句のような曖昧な表現は、根拠となる具体的な事実があればそちらを書く`,
      },
    ],
    schema: {
      type: "object",
      properties: { notes: { type: "string", description: "要点ノート(Markdownの箇条書き)" } },
      required: ["notes"],
      additionalProperties: false,
    },
    effort: "medium",
    maxTokens: 32000,
  });
  return result.notes.trim();
}

/**
 * テストの概要と資料ノートから、出題すべき「知識ポイント」の一覧案を作る。
 */
export async function proposeOutline(params: {
  course: CourseContext;
  rules: string[];
  pointCount: number;
}): Promise<{ label: string; summary: string }[]> {
  const result = await callJson<{ points: { label: string; summary: string }[] }>({
    system: `${SYSTEM_BASE}\n\n# 作問ルール\n${rulesBlock(params.rules)}`,
    content: [
      {
        type: "text",
        text: `${courseBlock(params.course)}

# 依頼
このテストで確認すべき「知識ポイント」を${params.pointCount}個前後で提案してください。
- 受験対象者が実務(顧客への説明・提案・判断)で本当に必要になる知識を優先する
- 知識ポイント同士が重複しないようにする
- 資料の記載をなぞるだけの暗記項目ではなく、実務の判断に使う知識にする
- label は15字程度の短い名前、summary はその知識ポイントで何を問うかを1〜2文で`,
      },
    ],
    schema: {
      type: "object",
      properties: {
        points: {
          type: "array",
          items: {
            type: "object",
            properties: { label: { type: "string" }, summary: { type: "string" } },
            required: ["label", "summary"],
            additionalProperties: false,
          },
        },
      },
      required: ["points"],
      additionalProperties: false,
    },
    effort: "high",
    maxTokens: 16000,
  });
  return result.points.filter((p) => p.label.trim());
}

/**
 * 1つの知識ポイントについて、パターン違いの問題を指定数だけ作る。
 * 同じテストのほかの知識ポイントの問題も渡し、内容の重複や矛盾を避ける。
 */
export async function generateQuestionsForPoint(params: {
  course: CourseContext;
  rules: string[];
  outline: OutlinePoint[];
  point: OutlinePoint;
  variants: number;
  otherQuestions: { label: string; question: QuestionDraft }[];
  instruction?: string;
}): Promise<QuestionDraft[]> {
  const outlineText = params.outline.map((p, i) => `${i + 1}. ${p.label}: ${p.summary}`).join("\n");
  const others =
    params.otherQuestions.length === 0
      ? "(まだありません)"
      : params.otherQuestions
          .map((o) => `【${o.label}】\n${questionForPrompt(o.question)}`)
          .join("\n\n");

  const result = await callJson<{ questions: RawQuestion[] }>({
    system: `${SYSTEM_BASE}\n\n# 作問ルール\n${rulesBlock(params.rules)}`,
    content: [
      {
        type: "text",
        text: `${courseBlock(params.course)}

# このテストの知識ポイント一覧
${outlineText}

# 同じテストの作成済みの問題(内容の重複・矛盾を避けるための参考)
${others}

# 依頼
知識ポイント「${params.point.label}」(${params.point.summary})について、
同じ知識を問う別パターンの4択問題を${params.variants}問作ってください。
- パターンごとに問い方・場面・選択肢を変える(言い換えただけの同じ問題にしない)
- 各問題はそれ単体で答えられるよう、必要な前提条件をすべて問題文に書く
- 根拠は資料の要点ノートに基づく。ノートにない数字を作らない
- 作問ルールをすべて守る${params.instruction ? `\n\n# 作成者からの追加指示\n${params.instruction}` : ""}`,
      },
    ],
    schema: {
      type: "object",
      properties: { questions: { type: "array", items: questionSchema } },
      required: ["questions"],
      additionalProperties: false,
    },
    effort: "high",
    maxTokens: 24000,
  });

  const drafts = result.questions.map(toDraft);
  if (drafts.length === 0) {
    throw new AuthoringAIError("AIが問題を作れませんでした。再実行してください。");
  }
  return drafts.slice(0, params.variants);
}

const lessonDescription =
  "この指摘から、今後ほかのテストを作るときにも守るべき一般的な作問ルールが読み取れる場合、そのルールを1〜2文で書く。" +
  "特定の問題だけの事実訂正・誤字修正など一般化できない場合や、既存の作問ルールですでに言われている内容の場合は空文字にする。";

/**
 * 問題への指摘コメントをもとに問題を直し、あわせて今後に活かす作問ルールを抽出する。
 * applyToGroup が true の場合、同じ知識ポイントのほかのパターンにも同じ指摘を反映する。
 */
export async function reviseWithComment(params: {
  course: CourseContext;
  rules: string[];
  pointLabel: string;
  target: { id: string; question: QuestionDraft };
  siblings: { id: string; question: QuestionDraft }[];
  comment: string;
  applyToGroup: boolean;
}): Promise<{ revisions: { id: string; question: QuestionDraft }[]; lesson: string }> {
  const siblingsText =
    params.siblings.length === 0
      ? "(なし)"
      : params.siblings.map((s) => `[id: ${s.id}]\n${questionForPrompt(s.question)}`).join("\n\n");

  const result = await callJson<{
    revisions: (RawQuestion & { id: string })[];
    lesson: string;
  }>({
    system: `${SYSTEM_BASE}\n\n# 作問ルール\n${rulesBlock(params.rules)}`,
    content: [
      {
        type: "text",
        text: `${courseBlock(params.course)}

# 指摘された問題(知識ポイント「${params.pointLabel}」)
[id: ${params.target.id}]
${questionForPrompt(params.target.question)}

# 同じ知識ポイントのほかのパターン
${siblingsText}

# 指摘内容
${params.comment}

# 依頼
1. 指摘内容に沿って、指摘された問題を修正してください。作問ルールも引き続き守ること。
${
  params.applyToGroup
    ? "2. 同じ知識ポイントのほかのパターンにも同じ問題点があれば、同様に修正してください(問題点がないパターンは revisions に含めない)。"
    : "2. ほかのパターンは修正しない(revisions には指摘された問題だけを含める)。"
}
3. lesson: ${lessonDescription}`,
      },
    ],
    schema: {
      type: "object",
      properties: {
        revisions: {
          type: "array",
          items: {
            ...questionSchema,
            properties: { id: { type: "string" }, ...questionSchema.properties },
            required: ["id", ...questionSchema.required],
          },
        },
        lesson: { type: "string", description: lessonDescription },
      },
      required: ["revisions", "lesson"],
      additionalProperties: false,
    },
    effort: "high",
    maxTokens: 24000,
  });

  const allowedIds = new Set([params.target.id, ...(params.applyToGroup ? params.siblings.map((s) => s.id) : [])]);
  return {
    revisions: result.revisions
      .filter((r) => allowedIds.has(r.id))
      .map((r) => ({ id: r.id, question: toDraft(r) })),
    lesson: result.lesson.trim(),
  };
}

/**
 * 人が問題を直接書き換えたとき、変更前後の差分(と任意の理由メモ)から作問ルールを抽出する。
 */
export async function extractLessonFromEdit(params: {
  rules: string[];
  before: QuestionDraft;
  after: QuestionDraft;
  reason: string;
}): Promise<string> {
  const result = await callJson<{ lesson: string }>({
    system: `${SYSTEM_BASE}\n\n# 作問ルール\n${rulesBlock(params.rules)}`,
    content: [
      {
        type: "text",
        text: `社員がAIの作った問題を手で書き換えました。変更前後を比べ、なぜ直したのかを読み取ってください。

# 変更前
${questionForPrompt(params.before)}

# 変更後
${questionForPrompt(params.after)}

# 書き換えた人のメモ
${params.reason || "(なし)"}

lesson: ${lessonDescription}`,
      },
    ],
    schema: {
      type: "object",
      properties: { lesson: { type: "string", description: lessonDescription } },
      required: ["lesson"],
      additionalProperties: false,
    },
    effort: "medium",
    maxTokens: 4000,
  });
  return result.lesson.trim();
}
