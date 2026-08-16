import { NextRequest, NextResponse } from "next/server";
import { getAttemptReview, TrainingAccessError } from "@/lib/trainingService";

export async function GET(
  req: NextRequest,
  { params }: { params: { token: string; attemptId: string } }
) {
  try {
    const review = await getAttemptReview(params.token, params.attemptId);
    return NextResponse.json(review);
  } catch (e) {
    if (e instanceof TrainingAccessError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: "予期しないエラーが発生しました。" }, { status: 500 });
  }
}
