import { NextRequest, NextResponse } from "next/server";
import { startTrainingAttempt, TrainingAccessError } from "@/lib/trainingService";

export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const result = await startTrainingAttempt(params.token);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof TrainingAccessError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: "予期しないエラーが発生しました。" }, { status: 500 });
  }
}
