import { NextRequest, NextResponse } from "next/server";
import { CurriculumError, getCurriculumForToken } from "@/lib/trainingCurriculum";

/**
 * GET /api/training/curriculum/[token]
 * 受講者向け: カリキュラムの内容と、自分の進み具合(動画の視聴・合否・受講リンク)を返す。
 */
export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  try {
    return NextResponse.json(await getCurriculumForToken(params.token));
  } catch (e) {
    if (e instanceof CurriculumError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "予期しないエラーが発生しました。" }, { status: 500 });
  }
}
