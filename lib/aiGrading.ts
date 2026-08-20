import { formatMbti, applyMbtiNicknamesToText } from "./mbti";

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

/**
 * 複数候補者の分野別スコアを比較し、それぞれの強み・弱みの傾向、
 * 候補者間の違いを採用担当者向けにまとめたコメントをAnthropic Claude APIで生成する。
 */
export async function generateComparisonSummary(params: {
  candidates: { name: string; fieldScores: Record<string, number> }[];
}): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY が設定されていません。");
  }

  const table = params.candidates
    .map((c) => {
      const scores = Object.entries(c.fieldScores)
        .map(([field, score]) => `${field}:${score}点`)
        .join(" / ");
      return `【${c.name}】${scores}`;
    })
    .join("\n");

  const prompt = `あなたはFP(ファイナンシャルプランナー)業界の採用担当者向けに、
複数候補者の入社適性テスト結果を比較分析するAIです。

以下は各候補者の分野別スコア(0〜100点)です。

${table}

この結果をもとに、採用担当者向けに、候補者間の傾向の違いを150〜250字程度の
日本語の文章で簡潔にまとめてください。具体的には、誰がどの分野で相対的に
強い・弱いか、候補者間で特に差が大きい分野、全員に共通する傾向があれば
それにも触れてください。出力は分析文章のみとし、見出しや箇条書き、
前置きは使わないでください。`;

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
    throw new Error(`AI比較分析APIエラー(${res.status}): ${text.slice(0, 300)}`);
  }

  const data2 = (await res.json()) as {
    content: { type: string; text?: string }[];
  };
  const textBlock2 = data2.content?.find((c) => c.type === "text");
  return (textBlock2?.text ?? "").trim();
}

export interface CompatibilityEntry {
  type: string;
  reason: string;
}

export interface RoleFitEntry {
  role: string;
  stars: number;
  reason: string;
}

export interface ComprehensiveReport {
  mbtiPersonality: string;
  fortunePersonality: string;
  overallSummary: string;
  howToHandle: string;
  goodCompatibility: CompatibilityEntry[];
  badCompatibility: CompatibilityEntry[];
  suitableRoles: RoleFitEntry[];
}

// 社内の職種区分(適性職種の判定に使う)
export const JOB_ROLES = [
  "開拓",
  "FP",
  "保険販売",
  "不動産販売",
  "不動産仕入",
  "事務",
  "マネソルの販売",
  "マーケティング",
  "マネジメント",
  "企画",
  "経営",
];

/**
 * MBTI・九星気学・六星占術・(あれば)本システムのテスト結果を統合し、
 * 総合レポート(性格・今年の運勢・扱い方・相性)をAnthropic Claude APIで生成する。
 * 社員(テスト結果なし)・候補者(テスト結果あり)の両方で使う。
 */
export async function generateComprehensiveReport(params: {
  name: string;
  mbti: string;
  kyuseiStar: string;
  rokuseiLabel: string;
  rokuseiReigou: boolean;
  currentYear: number;
  testSummary?: string | null;
  strengths?: string[] | null;
}): Promise<ComprehensiveReport> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY が設定されていません。");
  }

  const testSection = params.testSummary
    ? `# 本システムのテスト結果(総評)\n${params.testSummary}\n`
    : "";

  const strengthsLine =
    params.strengths && params.strengths.length > 0
      ? `ストレングスファインダー(CliftonStrengths)上位資質: ${params.strengths.join(", ")}\n`
      : "";

  const mbtiWithNickname = formatMbti(params.mbti);

  const prompt = `あなたはFP(ファイナンシャルプランナー)業界の人事・マネジメント向けに、
社員・候補者の総合的な人物理解をサポートする、詳細なレポートを作成するAIです。

対象者: ${params.name}
MBTIタイプ: ${mbtiWithNickname}
九星気学: ${params.kyuseiStar}
六星占術: ${params.rokuseiLabel}${params.rokuseiReigou ? "(霊合星人)" : ""}
現在の年: ${params.currentYear}年
${strengthsLine}${testSection}
以下の観点で、日本語で詳しく具体的にまとめてください。MBTIと占い(九星気学・六星占術)の
一般的な傾向・特徴を根拠として使い、断定しすぎず「傾向がある」「〜しやすい」
といったトーンで書いてください。相性については、実在する特定の人物と比較する
のではなく、MBTIタイプや占いのタイプに基づく一般的な相性傾向として述べてください。
MBTIタイプに言及する際は、必ず「ENTJ(指揮官)」のようにアルファベット4文字と
日本語の通称をセットで書いてください(通称だけ、コードだけの記載は避けてください)。
${strengthsLine ? "ストレングスファインダーの上位資質が登録されている場合は、mbtiPersonalityやhowToHandleの中で、その資質が実務のどんな場面で活きるかにも触れてください。\n" : ""}
抽象的な一般論だけでなく、具体的な行動特性や、実務(FP業務・営業・チーム内での
役割など)に落とし込んだ記述を心がけてください。

- mbtiPersonality: MBTIタイプから見た基本性格。強み・弱み・思考のクセ・
  コミュニケーションの特徴に触れながら300字程度で
- fortunePersonality: 占い(九星気学・六星占術)からわかる本人の性格・基本的な運勢の
  傾向、および${params.currentYear}年の運勢の傾向(仕事運・対人運・注意点なども含め)を
  300字程度で
- overallSummary: ${testSection ? "テスト結果も踏まえて、" : ""}MBTIと占いを総合して見た
  「本人はどういう人か」を、具体的なエピソード的観点(得意な場面・苦手な場面など)も
  交えて250字程度で
- howToHandle: 上司・同僚としてこの人とどう接するとよいか、褒め方・注意の仕方・
  任せると良い仕事・避けたほうがよい接し方など、実務的なマネジメント上の
  ポイントを250字程度で
- goodCompatibility: 相性がよいと考えられるタイプを3つ、それぞれ「type」(MBTIタイプなら
  必ず「ENTJ(指揮官)」の形式、占いのタイプ名でも可)と「reason」(80字程度の具体的な理由)で
- badCompatibility: 相性が悪い、または注意が必要と考えられるタイプを3つ、同様の形式で
  (「reason」には、どう付き合えば摩擦を減らせるかの一言アドバイスも含める)
- suitableRoles: 以下の社内職種区分「全て」について、適性の高さを1〜5の整数(星の数、
  5が最も適性が高い)で評価してください。リストにない職種名を作らない・省略しない、
  必ず全職種分を出力してください。それぞれ「role」(職種名。以下のリストの表記を
  そのまま使う)、「stars」(1〜5の整数)、「reason」(40字程度の具体的な理由。
  その人の性格特性がその仕事のどんな場面で活きる/活きにくいかを書く)で。
  評価には差をつけ、全職種が同じ星数にならないようにしてください。
  職種区分: ${JOB_ROLES.join("、")}

以下のJSON形式のみを出力してください。それ以外のテキストは一切含めないでください。
{
  "mbtiPersonality": "...",
  "fortunePersonality": "...",
  "overallSummary": "...",
  "howToHandle": "...",
  "goodCompatibility": [{"type": "...", "reason": "..."}, {"type": "...", "reason": "..."}, {"type": "...", "reason": "..."}],
  "badCompatibility": [{"type": "...", "reason": "..."}, {"type": "...", "reason": "..."}, {"type": "...", "reason": "..."}],
  "suitableRoles": [{"role": "...", "stars": 1, "reason": "..."}, ...(職種区分の数だけ全部)
}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 3000,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`AI総合レポートAPIエラー(${res.status}): ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    content: { type: string; text?: string }[];
  };
  const textBlock = data.content?.find((c) => c.type === "text");
  const raw = textBlock?.text ?? "";

  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error("AI総合レポート結果の解析に失敗しました: " + raw.slice(0, 200));
  }

  const parsed = JSON.parse(match[0]) as ComprehensiveReport;

  const normalizeEntry = (e: CompatibilityEntry): CompatibilityEntry => ({
    type: applyMbtiNicknamesToText(e.type ?? ""),
    reason: applyMbtiNicknamesToText(e.reason ?? ""),
  });

  const normalizeRole = (r: RoleFitEntry): RoleFitEntry => ({
    role: r.role ?? "",
    stars: Math.max(1, Math.min(5, Math.round(Number(r.stars) || 1))),
    reason: applyMbtiNicknamesToText(r.reason ?? ""),
  });

  return {
    mbtiPersonality: applyMbtiNicknamesToText(parsed.mbtiPersonality ?? ""),
    fortunePersonality: applyMbtiNicknamesToText(parsed.fortunePersonality ?? ""),
    overallSummary: applyMbtiNicknamesToText(parsed.overallSummary ?? ""),
    howToHandle: applyMbtiNicknamesToText(parsed.howToHandle ?? ""),
    suitableRoles: Array.isArray(parsed.suitableRoles)
      ? parsed.suitableRoles.map(normalizeRole).sort((a, b) => b.stars - a.stars)
      : [],
    goodCompatibility: Array.isArray(parsed.goodCompatibility)
      ? parsed.goodCompatibility.map(normalizeEntry)
      : [],
    badCompatibility: Array.isArray(parsed.badCompatibility)
      ? parsed.badCompatibility.map(normalizeEntry)
      : [],
  };
}

export interface TeamMemberInput {
  name: string;
  isLeader: boolean;
  mbti: string | null;
  kyuseiStar: string | null;
  rokuseiLabel: string | null;
  rokuseiReigou: boolean;
  suitableRoles: RoleFitEntry[] | null;
  cliftonStrengths: string[] | null;
}

export interface TeamMemberNote {
  name: string;
  note: string;
}

export interface TeamAnalysis {
  overallSummary: string;
  memberNotes: TeamMemberNote[];
  strengths: string;
  goalAdvice: string;
}

/**
 * チームの目標・メンバー構成(MBTI・占い・適性職種)をもとに、
 * チームの相性傾向・活かせる強み・目標達成へのアドバイスをAnthropic Claude APIで生成する。
 */
export async function generateTeamAnalysis(params: {
  teamName: string;
  department: string | null;
  goal: string | null;
  members: TeamMemberInput[];
}): Promise<TeamAnalysis> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY が設定されていません。");
  }

  const memberLines = params.members
    .map((m) => {
      const role = m.isLeader ? "リーダー" : "メンバー";
      const mbtiText = m.mbti ? formatMbti(m.mbti) : "MBTI未登録";
      const fortuneText =
        m.kyuseiStar && m.rokuseiLabel
          ? `九星気学: ${m.kyuseiStar} / 六星占術: ${m.rokuseiLabel}${m.rokuseiReigou ? "(霊合星人)" : ""}`
          : "占い情報未登録";
      const rolesText =
        m.suitableRoles && m.suitableRoles.length > 0
          ? "適性職種(上位3): " +
            m.suitableRoles
              .slice(0, 3)
              .map((r) => `${r.role}(★${r.stars})`)
              .join("、")
          : "適性職種未生成";
      const strengthsText =
        m.cliftonStrengths && m.cliftonStrengths.length > 0
          ? "ストレングスファインダー上位資質: " + m.cliftonStrengths.join(", ")
          : "ストレングスファインダー未登録";
      return `- ${m.name}(${role}): ${mbtiText} / ${fortuneText} / ${rolesText} / ${strengthsText}`;
    })
    .join("\n");

  const prompt = `あなたはFP(ファイナンシャルプランナー)業界の人事・マネジメント向けに、
チーム編成の相性・強みを分析するAIです。

チーム名: ${params.teamName}
部署: ${params.department || "未設定"}
チームの目標・役割: ${params.goal || "未設定"}

メンバー構成:
${memberLines}

MBTIと占い(九星気学・六星占術)の一般的な傾向、適性職種の評価、および(登録されていれば)
ストレングスファインダーの上位資質を根拠として使い、断定しすぎず「傾向がある」「〜しやすい」
といったトーンで、日本語で具体的にまとめてください。特に strengths(チームで活かせる強み)
の項目では、各メンバーのストレングスファインダーの資質が登録されていれば、それを最も重要な
根拠として使ってください。情報が未登録のメンバーについては、その旨を踏まえた上で無理に断定
しないでください。
MBTIタイプに言及する際は、必ず「ENTJ(指揮官)」のようにアルファベット4文字と
日本語の通称をセットで書いてください。

- overallSummary: チーム全体で見た相性の傾向(強み・注意点)を250字程度で
- memberNotes: メンバー一人ひとりについて、このチームでの活かし方・リーダーとの関係性の
  アドバイスを「name」(氏名。上記の表記のまま)と「note」(100字程度)のペアで、
  メンバー全員分(リーダーも含む)
- strengths: チームの目標(${params.goal || "未設定"})に対して、このメンバー構成で
  活かせる強みを200字程度で具体的に
- goalAdvice: 目標達成に向けて、チーム編成・役割分担上のアドバイスを200字程度で

以下のJSON形式のみを出力してください。それ以外のテキストは一切含めないでください。
{
  "overallSummary": "...",
  "memberNotes": [{"name": "...", "note": "..."}, ...(メンバー全員分)],
  "strengths": "...",
  "goalAdvice": "..."
}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`AIチーム分析APIエラー(${res.status}): ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    content: { type: string; text?: string }[];
  };
  const textBlock = data.content?.find((c) => c.type === "text");
  const raw = textBlock?.text ?? "";

  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error("AIチーム分析結果の解析に失敗しました: " + raw.slice(0, 200));
  }

  const parsed = JSON.parse(match[0]) as TeamAnalysis;

  return {
    overallSummary: applyMbtiNicknamesToText(parsed.overallSummary ?? ""),
    memberNotes: Array.isArray(parsed.memberNotes)
      ? parsed.memberNotes.map((m) => ({
          name: m.name ?? "",
          note: applyMbtiNicknamesToText(m.note ?? ""),
        }))
      : [],
    strengths: applyMbtiNicknamesToText(parsed.strengths ?? ""),
    goalAdvice: applyMbtiNicknamesToText(parsed.goalAdvice ?? ""),
  };
}