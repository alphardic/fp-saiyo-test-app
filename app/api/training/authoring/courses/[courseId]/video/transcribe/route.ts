import { NextRequest } from "next/server";
import { AuthoringError, handleAuthoring, loadCourseForActor, resolveActor } from "@/lib/trainingAuthoring";
import { TranscribeError, transcribeWavBase64 } from "@/lib/transcribeAudio";

/** 1回に受け付ける音声の上限(16kHz・モノラル・16bit の WAV で約3分) */
const MAX_WAV_BYTES = 6 * 1024 * 1024;

/**
 * POST /api/training/authoring/courses/[courseId]/video/transcribe
 * 研修動画の音声の一部(画面側で1分ずつに分けた WAV)を文字にして返す。
 * 画面側が全部の区間を文字にしてから、まとめて資料ノートに保存する。
 * body: { wav: "<base64>" }
 */
export async function POST(req: NextRequest, { params }: { params: { courseId: string } }) {
  return handleAuthoring(async () => {
    const actor = await resolveActor(req);
    await loadCourseForActor(actor, params.courseId, { edit: true });
    const body = (await req.json().catch(() => ({}))) as { wav?: string };
    if (!body.wav) throw new AuthoringError("音声がありません。", 400);
    if (body.wav.length * 0.75 > MAX_WAV_BYTES) throw new AuthoringError("音声が長すぎます。", 400);
    try {
      return { text: await transcribeWavBase64(body.wav) };
    } catch (e) {
      if (e instanceof TranscribeError) throw new AuthoringError(e.message, 500);
      throw new AuthoringError("文字起こしに失敗しました: " + (e instanceof Error ? e.message : ""), 502);
    }
  });
}
