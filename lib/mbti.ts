/**
 * MBTIの4文字コードと日本語の通称(ニックネーム)をまとめたユーティリティ。
 * 画面表示・AIレポート生成の両方で「ENTJ(指揮官)」のように統一表記するために使う。
 */

export const MBTI_NICKNAMES: Record<string, string> = {
  INTJ: "建築家",
  INTP: "論理学者",
  ENTJ: "指揮官",
  ENTP: "討論者",
  INFJ: "提唱者",
  INFP: "仲介者",
  ENFJ: "主人公",
  ENFP: "広報運動家",
  ISTJ: "管理者",
  ISFJ: "擁護者",
  ESTJ: "幹部",
  ESFJ: "領事官",
  ISTP: "巨匠",
  ISFP: "冒険家",
  ESTP: "起業家",
  ESFP: "エンターテイナー",
};

export const MBTI_TYPES = Object.keys(MBTI_NICKNAMES);

/** "ENTJ" → "ENTJ(指揮官)"。未知のコードや既にニックネーム付きの場合はそのまま返す。 */
export function formatMbti(code: string | null | undefined): string {
  if (!code) return "";
  const trimmed = code.trim();
  const nickname = MBTI_NICKNAMES[trimmed.toUpperCase()];
  if (!nickname) return trimmed;
  if (trimmed.includes(nickname)) return trimmed; // 既にニックネーム付きならそのまま
  return `${trimmed.toUpperCase()}(${nickname})`;
}

/**
 * 自由文中に出てくるMBTIコード(例: "ENTJ")を、
 * すべて "ENTJ(指揮官)" の形式に統一する(AI生成テキストの後処理用)。
 * 既に "ENTJ(指揮官)" のように書かれている箇所は二重に付与しない。
 */
export function applyMbtiNicknamesToText(text: string): string {
  if (!text) return text;
  let result = text;
  for (const code of MBTI_TYPES) {
    const nickname = MBTI_NICKNAMES[code];
    // 直後に "(" が続いていない出現箇所のみ置換する
    const pattern = new RegExp(`${code}(?!\\s*[((])`, "g");
    result = result.replace(pattern, `${code}(${nickname})`);
  }
  return result;
}