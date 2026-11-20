/**
 * Vimeo の動画URLを扱う小さな関数群(サーバー・画面の両方で使う)。
 *
 * 受け付ける形式:
 *   https://vimeo.com/123456789
 *   https://vimeo.com/123456789/abcdef1234      (限定公開: 末尾がプライバシー用のハッシュ)
 *   https://player.vimeo.com/video/123456789?h=abcdef1234
 *   https://vimeo.com/manage/videos/123456789/abcdef1234
 */
export interface VimeoRef {
  id: string;
  hash: string | null;
}

export function parseVimeoUrl(raw: string): VimeoRef | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, "");
  if (host !== "vimeo.com" && host !== "player.vimeo.com") return null;

  const parts = url.pathname.split("/").filter(Boolean);
  const idIndex = parts.findIndex((p) => /^\d+$/.test(p));
  if (idIndex < 0) return null;

  const id = parts[idIndex];
  const next = parts[idIndex + 1];
  const hash = url.searchParams.get("h") ?? (next && /^[0-9a-f]+$/i.test(next) ? next : null);
  return { id, hash };
}

/** 埋め込み用のプレーヤーURL。保存するときはこの形にそろえる */
export function toVimeoPlayerUrl(raw: string): string | null {
  const ref = parseVimeoUrl(raw);
  if (!ref) return null;
  const params = new URLSearchParams();
  if (ref.hash) params.set("h", ref.hash);
  // 速度変更ボタン(1.5倍・2倍など)を出す。dnt は視聴者の行動をVimeoに追跡させない設定
  params.set("speed", "1");
  params.set("dnt", "1");
  return `https://player.vimeo.com/video/${ref.id}?${params.toString()}`;
}

/** 最後まで見たとみなす割合。早送りで飛ばした部分は数えない */
export const VIDEO_COMPLETE_RATIO = 0.95;
