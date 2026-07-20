const CLAUDE_MODEL = "claude-sonnet-5";

export interface GradeResult {
  score: number;
  notes: string;
}

/**
 * 記述式回答をAnthropic Claude APIで採点する。
 * 模範解答・採点観点(questions.answer / questions.explanation)を基準に
 * 0〜100点のスコアと、採点理由の短いコメントを返す。
 */
export async function gradeDescriptiveAnswer(params: {
  question: string;
  modelAnswer: string;
  gradingCriteria: string;
  candidateAnswer: string;
}): Promise<GradeResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY が設定されていません。");
  }

  const prompt = `あなたはFP(ファイナンシャルプランナー)業界の採用担当者向けに、
入社適性テストの記述式回答を採点するAIです。

以下の設問・模範解答・採点観点をもとに、候補者の回答を0〜100点で採点し、
採点理由を日本語で簡潔に(80字程度)述べてください。
模範解答と一言一句一致している必要はなく、観点を踏まえた論理的な回答であれば
高得点を付けてください。無回答や趣旨が大きく外れている場合は低得点にしてください。

# 設問
${params.question}

# 模範解答
${params.modelAnswer}

# 採点観点
${params.gradingCriteria}

# 候補者の回答
${params.candidateAnswer || "(未回答)"}

以下のJSON形式のみを出力してください。それ以外のテキストは一切含めないでください。
{"score": 0から100の整数, "notes": "採点理由"}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`AI採点APIエラー(${res.status}): ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    content: { type: string; text?: string }[];
  };

  const textBlock = data.content?.find((c) => c.type === "text");
  const raw = textBlock?.text ?? "";

  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error("AI採点結果の解析に失敗しました: " + raw.slice(0, 200));
  }

  const parsed = JSON.parse(match[0]) as { score: number; notes: string };
  const score = Math.max(0, Math.min(100, Math.round(Number(parsed.score) || 0)));

  return { score, notes: parsed.notes ?? "" };
}