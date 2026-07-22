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

# 採点の考え方(重要)
これは「観点をいくつ満たしたかを積み上げて点数を作る」加点方式のテストでは
ありません。逆に、**まず70点を出発点とし、そこから減点していく方式**で
採点してください。

手順:
1. 候補者の回答の中に、事実として明確な間違い(誤った知識・逆の理解)が
   含まれていないか確認する。無ければ減点しない。
2. 設問の問い(結論・判断)に正面から答えられているか確認する。答えていれば
   減点しない。論点がずれている・質問に答えていない場合のみ減点する。
3. 「採点観点」①②③...はあくまで模範解答が触れている着眼点の例示であり、
   全項目を書けているかのチェックリストではない。回答がそのうち触れていない
   観点があっても、それだけを理由に減点しないこと。ただし、他の観点に
   触れることで相応の深さ・具体性が示されていれば加点(70点台後半〜)して良い。
4. 回答が短い・簡潔であること自体は減点理由にしない。模範解答より大幅に
   短くても、誤りなく要点を突いていれば70点前後を維持して構わない。

目安:
- 90〜100点: 誤りがなく、根拠や具体性も伴っている
- 70〜89点: 誤りがなく、設問に正面から答えられている(基本形。観点を
  全部網羅していなくてもここに入ってよい)
- 40〜69点: 大枠は誤っていないが、質問への答えが曖昧、論点がややずれている、
  または内容に薄い誤りがある
- 15〜39点: 明確な誤りがある、設問の趣旨から外れている
- 0〜14点: 無回答、またはほぼ的外れ

# 設問
${params.question}

# 模範解答
${params.modelAnswer}

# 採点観点(着眼点。全て触れている必要はない)
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

/**
 * 分野別スコアをもとに、候補者の強み・弱みをまとめる総評をAnthropic Claude APIで生成する。
 */
export async function generateOverallSummary(params: {
  candidateName: string;
  fieldScores: Record<string, number>;
}): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY が設定されていません。");
  }

  const scoresText = Object.entries(params.fieldScores)
    .map(([field, score]) => `${field}: ${score}点`)
    .join("\n");

  const prompt = `あなたはFP(ファイナンシャルプランナー)業界の採用担当者向けに、
入社適性テストの結果を要約するAIです。

候補者「${params.candidateName}」の分野別スコア(0〜100点、13分野)は以下の通りです。

${scoresText}

この結果をもとに、採用担当者向けに、候補者の強み・弱みを120〜200字程度の
日本語の文章で簡潔にまとめてください。特に高い分野・低い分野に触れ、
実務上の示唆(得意分野を活かせる業務、補強が必要な分野など)を含めてください。
出力は要約の文章のみとし、見出しや箇条書き、前置きは使わないでください。`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 500,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`AI要約APIエラー(${res.status}): ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    content: { type: string; text?: string }[];
  };
  const textBlock = data.content?.find((c) => c.type === "text");
  return (textBlock?.text ?? "").trim();
}