/**
 * Vimeo API(サーバー側)。アクセストークンは Cloudflare の Secret `VIMEO_TOKEN` に置く。
 * トークンに必要な権限: public / private / upload / edit / video_files
 *
 * 動画ファイル本体はサーバーを通さず、ブラウザから Vimeo へ直接送る(tus 方式)。
 * サーバーは「アップロード枠の作成」「タイトル・説明の設定」「サムネイルの設定」
 * 「状態・字幕の取得」だけを行う。
 */

const API = "https://api.vimeo.com";

export class VimeoError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

function token(): string {
  const t = process.env.VIMEO_TOKEN;
  if (!t) {
    throw new VimeoError(
      "Vimeo のアクセストークンが設定されていません。Cloudflare の Secret に VIMEO_TOKEN を登録してください。",
      500
    );
  }
  return t;
}

async function vimeo<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const res = await fetch(path.startsWith("http") ? path : API + path, {
    ...rest,
    headers: {
      Authorization: `bearer ${token()}`,
      Accept: "application/vnd.vimeo.*+json;version=3.4",
      ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(rest.headers ?? {}),
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; developer_message?: string };
    const detail = body.error || body.developer_message || res.statusText;
    if (res.status === 401) throw new VimeoError("Vimeo のトークンが無効です。VIMEO_TOKEN を確認してください。", 500);
    if (res.status === 403) {
      throw new VimeoError(`Vimeo に操作を断られました(権限不足の可能性があります): ${detail}`, 500);
    }
    throw new VimeoError(`Vimeo の操作に失敗しました(${res.status}): ${detail}`, 500);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export interface CreatedUpload {
  /** "/videos/123456789" */
  uri: string;
  /** "https://vimeo.com/123456789/abcdef"(限定公開のハッシュ付き) */
  link: string;
  /** ブラウザが tus で動画を送る先 */
  uploadLink: string;
}

/**
 * アップロード枠を作る。限定公開・埋め込みは指定ドメインのみに設定する。
 */
export async function createVideoUpload(params: {
  name: string;
  size: number;
  embedDomain: string;
}): Promise<CreatedUpload> {
  const video = await vimeo<{ uri: string; link: string; upload: { upload_link: string } }>("/me/videos", {
    method: "POST",
    json: {
      upload: { approach: "tus", size: String(params.size) },
      name: params.name,
      privacy: { view: "unlisted", embed: "whitelist", download: false },
      embed: { speed: true },
    },
  });
  // 埋め込みを許可するドメイン(研修アプリ)を登録する
  await vimeo(`${video.uri}/privacy/domains/${encodeURIComponent(params.embedDomain)}`, { method: "PUT" });
  return { uri: video.uri, link: video.link, uploadLink: video.upload.upload_link };
}

export interface VideoState {
  /** "available" になれば再生できる */
  status: string;
  transcode: string | null;
  durationSec: number;
  link: string;
}

export async function getVideoState(uri: string): Promise<VideoState> {
  const v = await vimeo<{ status: string; transcode?: { status: string }; duration: number; link: string }>(
    `${uri}?fields=status,transcode.status,duration,link`
  );
  return { status: v.status, transcode: v.transcode?.status ?? null, durationSec: v.duration ?? 0, link: v.link };
}

export async function updateVideoText(uri: string, name: string, description: string): Promise<void> {
  await vimeo(uri, { method: "PATCH", json: { name, description } });
}

/** PNG を動画のサムネイルとして設定する */
export async function setVideoThumbnail(uri: string, png: ArrayBuffer): Promise<void> {
  const picture = await vimeo<{ uri: string; link: string }>(`${uri}/pictures`, { method: "POST", json: {} });
  const put = await fetch(picture.link, {
    method: "PUT",
    headers: { "Content-Type": "image/png", Accept: "application/vnd.vimeo.*+json;version=3.4" },
    body: png,
  });
  if (!put.ok) throw new VimeoError(`サムネイル画像の送信に失敗しました(${put.status})。`, 500);
  await vimeo(picture.uri, { method: "PATCH", json: { active: true } });
}

/**
 * Vimeo が作った字幕(自動字幕を含む)を文字だけにして返す。無ければ null。
 * 自動字幕は Vimeo のプランや設定によって作られないことがある。
 */
export async function fetchTranscript(uri: string): Promise<string | null> {
  const tracks = await vimeo<{ data: { link: string; language: string; type: string; active: boolean }[] }>(
    `${uri}/texttracks`
  );
  const track =
    tracks.data.find((t) => t.language?.startsWith("ja")) ?? tracks.data.find((t) => t.active) ?? tracks.data[0];
  if (!track?.link) return null;
  const res = await fetch(track.link);
  if (!res.ok) return null;
  const vtt = await res.text();
  const lines = vtt
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && l !== "WEBVTT" && !l.includes("-->") && !/^\d+$/.test(l) && !/^(NOTE|STYLE|REGION)\b/.test(l))
    .map((l) => l.replace(/<[^>]+>/g, ""));
  // 字幕は1行ずつ重なって出てくることがあるので、連続する重複を除く
  const text = lines.filter((l, i) => l !== lines[i - 1]).join("\n");
  return text.trim() || null;
}
