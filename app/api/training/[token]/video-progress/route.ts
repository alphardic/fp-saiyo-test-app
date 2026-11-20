import { NextRequest, NextResponse } from "next/server";
import { recordTrainingVideoProgress, TrainingAccessError } from "@/lib/trainingService";

/**
 * POST /api/training/[token]/video-progress
 * 研修動画の視聴記録を足す。body: { seconds: number[], duration: number }
 * seconds は「何秒目を再生したか」の一覧(画面側で早送りの区間は除いてある)。
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  const body = (await req.json().catch(() => ({}))) as { seconds?: unknown; duration?: unknown };
  const seconds = Array.isArray(body.seconds) ? body.seconds.filter((s): s is number => typeof s === "number") : [];
  const duration = typeof body.duration === "number" ? body.duration : 0;

  try {
    const video = await recordTrainingVideoProgress(params.token, seconds, duration);
    return NextResponse.json({ video });
  } catch (e) {
    if (e instanceof TrainingAccessError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: "予期しないエラーが発生しました。" }, { status: 500 });
  }
}
