import { NextRequest, NextResponse } from "next/server";
import { getTrainingStatusForToken, TrainingAccessError } from "@/lib/trainingService";

export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const status = await getTrainingStatusForToken(params.token);
    return NextResponse.json(status);
  } catch (e) {
    if (e instanceof TrainingAccessError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: "予期しないエラーが発生しました。" }, { status: 500 });
  }
}
