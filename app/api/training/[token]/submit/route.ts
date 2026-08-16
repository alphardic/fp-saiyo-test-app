import { NextRequest, NextResponse } from "next/server";
import { submitTrainingAttempt, TrainingAccessError } from "@/lib/trainingService";

interface SubmitAnswer {
  questionId: string;
  answer: string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  const body = (await req.json().catch(() => ({}))) as { answers?: SubmitAnswer[] };

  try {
    const result = await submitTrainingAttempt(params.token, body.answers ?? []);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof TrainingAccessError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: "予期しないエラーが発生しました。" }, { status: 500 });
  }
}
