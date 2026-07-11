import { NextRequest, NextResponse } from "next/server";
import { getExamForToken, ExamAccessError } from "@/lib/examService";

export const runtime = "edge";

/**
 * GET /api/exam/[token]
 * 招待トークンから候補者・受験セッションを特定し、
 * 出題対象の問題(正解・解説を除いた形)を返す。
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const result = await getExamForToken(params.token);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof ExamAccessError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: "予期しないエラーが発生しました。" }, { status: 500 });
  }
}
