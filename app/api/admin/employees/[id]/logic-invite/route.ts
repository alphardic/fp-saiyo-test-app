import type { RokuseiResult } from "./fortune";

/**
 * MBTI・九星気学・六星占術に基づく、2者間の「一般的な相性の傾向」を
 * 0〜100のスコアで算出するユーティリティ。
 * あくまで一般的な傾向に基づく参考値であり、断定的な診断ではない。
 */

// ---- 五行(木・火・土・金・水)の相生・相剋関係 ----

const GENERATING: [string, string][] = [
  ["木", "火"],
  ["火", "土"],
  ["土", "金"],
  ["金", "水"],
  ["水", "木"],
];

const DESTRUCTIVE: [string, string][] = [
  ["木", "土"],
  ["土", "水"],
  ["水", "火"],
  ["火", "金"],
  ["金", "木"],
];

function pairExists(pairs: [string, string][], a: string, b: string): boolean {
  return pairs.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

/** 五行の関係から相性スコア(0〜100)を出す。相生=高い、比和(同じ)=中程度、相剋=低い。 */
function elementScore(a: string, b: string): number {
  if (a === b) return 68;
  if (pairExists(GENERATING, a, b)) return 88;
  if (pairExists(DESTRUCTIVE, a, b)) return 32;
  return 50;
}

// ---- 九星気学: 本命星 → 五行 ----

const KYUSEI_ELEMENT: Record<string, string> = {
  一白水星: "水",
  二黒土星: "土",
  三碧木星: "木",
  四緑木星: "木",
  五黄土星: "土",
  六白金星: "金",
  七赤金星: "金",
  八白土星: "土",
  九紫火星: "火",
};

export function kyuseiCompatibilityScore(starA: string, starB: string): number {
  const eA = KYUSEI_ELEMENT[starA];
  const eB = KYUSEI_ELEMENT[starB];
  if (!eA || !eB) return 50;
  return elementScore(eA, eB);
}

// ---- 六星占術: 星人 → 五行(天王星人は五行に属さない特殊な型) ----

const ROKUSEI_ELEMENT: Record<string, string | null> = {
  土星人: "土",
  金星人: "金",
  火星人: "火",
  木星人: "木",
  水星人: "水",
  天王星人: null,
};

export function rokuseiCompatibilityScore(a: RokuseiResult, b: RokuseiResult): number {
  const eA = ROKUSEI_ELEMENT[a.star];
  const eB = ROKUSEI_ELEMENT[b.star];
  let base: number;
  if (!eA || !eB) {
    // 天王星人が絡む場合は五行によらず、独立型同士として中程度の基準値を使う
    base = 60;
  } else {
    base = elementScore(eA, eB);
  }
  const signAdj = a.sign === b.sign ? 5 : -3;
  return Math.max(0, Math.min(100, base + signAdj));
}

// ---- MBTI: 4軸の一致・相補関係に基づく簡易スコア ----

export function mbtiCompatibilityScore(a: string, b: string): number {
  const codeA = (a || "").toUpperCase();
  const codeB = (b || "").toUpperCase();
  if (codeA.length !== 4 || codeB.length !== 4) return 50;

  let score = 50;
  // E/I: 異なる方がやや相補的
  score += codeA[0] === codeB[0] ? 8 : 12;
  // S/N: 同じ方が価値観・コミュニケーションが合いやすい
  score += codeA[1] === codeB[1] ? 18 : -10;
  // T/F: 異なる方が判断の視点を補い合える
  score += codeA[2] === codeB[2] ? 8 : 12;
  // J/P: 同じ方がペースが合いやすい
  score += codeA[3] === codeB[3] ? 10 : -4;

  return Math.max(0, Math.min(100, score));
}

export interface CompatibilityProfile {
  mbti: string;
  kyuseiStar: string;
  rokusei: RokuseiResult;
}

export interface CompatibilityScores {
  overall: number;
  mbti: number;
  kyusei: number;
  rokusei: number;
}

export function computeCompatibility(
  a: CompatibilityProfile,
  b: CompatibilityProfile
): CompatibilityScores {
  const mbti = mbtiCompatibilityScore(a.mbti, b.mbti);
  const kyusei = kyuseiCompatibilityScore(a.kyuseiStar, b.kyuseiStar);
  const rokusei = rokuseiCompatibilityScore(a.rokusei, b.rokusei);
  const overall = Math.round((mbti + kyusei + rokusei) / 3);
  return { overall, mbti, kyusei, rokusei };
}