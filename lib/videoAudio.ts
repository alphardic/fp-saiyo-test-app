/**
 * ブラウザで動画ファイルから音声を取り出し、文字起こし用に 16kHz・モノラル・16bit の WAV に分ける。
 * (Whisper は 16kHz の音声で学習されているので、この形が最も小さく、精度も落ちない)
 */

export const SAMPLE_RATE = 16000;

export interface AudioTrack {
  /** モノラルの音声(-1〜1) */
  samples: Float32Array;
  durationSec: number;
}

export async function decodeAudio(file: File): Promise<AudioTrack> {
  const buffer = await file.arrayBuffer();
  // OfflineAudioContext は音を鳴らさずに、指定したサンプルレートへ変換しながら読み込める
  const ctx = new OfflineAudioContext(1, SAMPLE_RATE, SAMPLE_RATE);
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(buffer);
  } catch {
    throw new Error("動画から音声を取り出せませんでした。音声の入っていない動画か、ブラウザが読めない形式の可能性があります。");
  }
  const length = decoded.length;
  const samples = new Float32Array(length);
  for (let ch = 0; ch < decoded.numberOfChannels; ch++) {
    const data = decoded.getChannelData(ch);
    for (let i = 0; i < length; i++) samples[i] += data[i] / decoded.numberOfChannels;
  }
  return { samples, durationSec: length / SAMPLE_RATE };
}

/** 区間の数(chunkSec 秒ずつ) */
export function chunkCount(track: AudioTrack, chunkSec: number): number {
  return Math.max(1, Math.ceil(track.samples.length / (chunkSec * SAMPLE_RATE)));
}

/** index 番目の区間を WAV の base64 にする */
export function chunkToWavBase64(track: AudioTrack, index: number, chunkSec: number): string {
  const start = index * chunkSec * SAMPLE_RATE;
  const part = track.samples.subarray(start, Math.min(start + chunkSec * SAMPLE_RATE, track.samples.length));
  const bytes = new Uint8Array(44 + part.length * 2);
  const view = new DataView(bytes.buffer);
  const writeText = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  writeText(0, "RIFF");
  view.setUint32(4, 36 + part.length * 2, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true); // fmt チャンクの長さ
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // モノラル
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true); // 1秒あたりのバイト数
  view.setUint16(32, 2, true); // 1サンプルのバイト数
  view.setUint16(34, 16, true); // 16bit
  writeText(36, "data");
  view.setUint32(40, part.length * 2, true);
  for (let i = 0; i < part.length; i++) {
    const s = Math.max(-1, Math.min(1, part[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  let binary = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(binary);
}
