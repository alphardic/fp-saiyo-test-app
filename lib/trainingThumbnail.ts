/**
 * 研修動画のサムネイル画像(1280x720)をブラウザの canvas で描く。
 * 文言(見出し・補足・キーワード)は AI が作り、画面で手直しできる。
 */

export interface ThumbnailCopy {
  headline: string;
  subline: string;
  keywords: string[];
}

export const THUMB_WIDTH = 1280;
export const THUMB_HEIGHT = 720;

const FONT = `"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic", "Meiryo", sans-serif`;

/** 1行に収まるように日本語を文字単位で折り返す(最大 maxLines 行。あふれたら末尾を「…」) */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const ch of Array.from(text)) {
    if (ctx.measureText(current + ch).width > maxWidth && current) {
      lines.push(current);
      current = ch;
      if (lines.length === maxLines) break;
    } else {
      current += ch;
    }
  }
  if (lines.length < maxLines && current) lines.push(current);
  const used = lines.join("").length;
  if (used < Array.from(text).length && lines.length > 0) {
    let last = lines[lines.length - 1];
    while (last && ctx.measureText(last + "…").width > maxWidth) last = last.slice(0, -1);
    lines[lines.length - 1] = last + "…";
  }
  return lines;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawThumbnail(canvas: HTMLCanvasElement, copy: ThumbnailCopy): void {
  canvas.width = THUMB_WIDTH;
  canvas.height = THUMB_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // 背景: 紺のグラデーション + 右上の淡い円
  const bg = ctx.createLinearGradient(0, 0, THUMB_WIDTH, THUMB_HEIGHT);
  bg.addColorStop(0, "#0b1b33");
  bg.addColorStop(1, "#1c3a66");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, THUMB_WIDTH, THUMB_HEIGHT);
  ctx.fillStyle = "rgba(201, 162, 74, 0.10)";
  ctx.beginPath();
  ctx.arc(1120, 80, 320, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255, 255, 255, 0.04)";
  ctx.beginPath();
  ctx.arc(1180, 640, 220, 0, Math.PI * 2);
  ctx.fill();

  const left = 88;
  const maxWidth = THUMB_WIDTH - left * 2;

  // 左上のラベル
  ctx.font = `700 30px ${FONT}`;
  const label = "社内研修";
  const labelWidth = ctx.measureText(label).width + 44;
  roundRect(ctx, left, 72, labelWidth, 54, 27);
  ctx.fillStyle = "#c9a24a";
  ctx.fill();
  ctx.fillStyle = "#0b1b33";
  ctx.textBaseline = "middle";
  ctx.fillText(label, left + 22, 100);

  // 見出し・補足・キーワードが下端(LIMIT)に収まるまで、見出しの文字サイズを小さくしていく
  const LIMIT = 660;
  const keywords = copy.keywords.map((k) => k.trim()).filter(Boolean).slice(0, 3);
  const subText = copy.subline.trim();
  const headText = copy.headline.trim() || "研修動画";
  let layout: { size: number; lines: string[]; sub: string[] } | null = null;
  for (let size = 96; size >= 52; size -= 4) {
    ctx.font = `800 ${size}px ${FONT}`;
    const lines = wrap(ctx, headText, maxWidth, 2);
    ctx.font = `600 40px ${FONT}`;
    const sub = subText ? wrap(ctx, subText, maxWidth, lines.length > 1 ? 1 : 2) : [];
    const headBottom = 180 + size + (lines.length - 1) * Math.round(size * 1.2);
    const subBottom = headBottom + 40 + (sub.length > 0 ? 36 + sub.length * 54 : 0);
    const chipsBottom = subBottom + (keywords.length > 0 ? 24 + 60 : 0);
    const fitsHead = lines.join("").length >= Array.from(headText).length;
    layout = { size, lines, sub };
    if (fitsHead && chipsBottom <= LIMIT) break;
  }
  const { size, lines, sub } = layout!;

  ctx.font = `800 ${size}px ${FONT}`;
  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "alphabetic";
  let y = 180 + size;
  lines.forEach((line, i) => {
    ctx.fillText(line, left, y);
    if (i < lines.length - 1) y += Math.round(size * 1.2);
  });

  // 見出しの下の金色の線
  y += 36;
  ctx.fillStyle = "#c9a24a";
  ctx.fillRect(left, y, 120, 8);
  y += 8;

  // 補足
  if (sub.length > 0) {
    ctx.font = `600 40px ${FONT}`;
    ctx.fillStyle = "#e8edf5";
    y += 36;
    for (const line of sub) {
      y += 40;
      ctx.fillText(line, left, y);
      y += 14;
    }
  }

  // キーワード(チップ)
  ctx.font = `700 30px ${FONT}`;
  ctx.textBaseline = "middle";
  let x = left;
  const chipTop = Math.max(y + 24, 520);
  for (const keyword of keywords) {
    const w = ctx.measureText(keyword).width + 48;
    if (x + w > THUMB_WIDTH - left) break;
    roundRect(ctx, x, chipTop, w, 60, 30);
    ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
    ctx.fill();
    ctx.strokeStyle = "rgba(201, 162, 74, 0.9)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.fillText(keyword, x + 24, chipTop + 31);
    x += w + 16;
  }

  // 右下のロゴ文字
  ctx.font = `italic 600 26px Georgia, "Times New Roman", serif`;
  ctx.fillStyle = "rgba(201, 162, 74, 0.95)";
  ctx.textAlign = "right";
  ctx.fillText("α-Financial Planners", THUMB_WIDTH - 56, THUMB_HEIGHT - 40);
  ctx.textAlign = "left";
}

/** canvas を PNG の base64(data: なし)にする */
export function canvasToPngBase64(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL("image/png").replace(/^data:image\/png;base64,/, "");
}
