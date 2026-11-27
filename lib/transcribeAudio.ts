import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Cloudflare Workers AI の Whisper で、研修動画の音声(1分ほどの WAV)を文字にする。
 * wrangler.jsonc の "ai" バインディング(AI)を使う。API キーは要らない。
 */

const MODEL = "@cf/openai/whisper-large-v3-turbo";

interface WhisperOutput {
  text: string;
}

interface AiBinding {
  run(model: string, inputs: Record<string, unknown>): Promise<WhisperOutput>;
}

export class TranscribeError extends Error {}

export async function transcribeWavBase64(wavBase64: string): Promise<string> {
  const { env } = await getCloudflareContext({ async: true });
  const ai = (env as unknown as { AI?: AiBinding }).AI;
  if (!ai) {
    throw new TranscribeError(
      "文字起こしの準備がまだです(Cloudflare の AI バインディングがありません)。wrangler.jsonc の ai 設定を確認してください。"
    );
  }
  const result = await ai.run(MODEL, {
    audio: wavBase64,
    task: "transcribe",
    language: "ja",
    // 無音の区間を飛ばして、無音での誤認識(同じ言葉の繰り返しなど)を防ぐ
    vad_filter: true,
    condition_on_previous_text: false,
  });
  return (result.text ?? "").trim();
}
