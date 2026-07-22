import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/adminAuth";
import { generateComparisonSummary } from "@/lib/aiGrading";
import { computeSessionFieldScores, overallAverage } from "@/lib/scoring";

interface SessionRow {
  id: string;
  status: string;
  candidates: { name: string; email: string } | null;
}

/**
 * GET /api/admin/compare?ids=sessionId1,sessionId2,...
 * 選択された複数の受験セッションについて、分野別スコアとAIによる
 * 傾向比較コメントをまとめて返す(ダッシュボードの「比較する」機能用)。
 */
export async function GET(req: NextRequest) {
  const authResult = await requireAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const idsParam = req.nextUrl.searchParams.get("ids") ?? "";
  const ids = idsParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (ids.length < 2) {
    return NextResponse.json(
      { error: "比較するには候補者を2名以上選択してください。" },
      { status: 400 }
    );
  }
  if (ids.length > 6) {
    return NextResponse.json(
      { error: "比較は一度に6名までにしてください。" },
      { status: 400 }
    );
  }

  const supabase = getSupabaseServerClient();

  const { data: sessions } = await supabase
    .from("exam_sessions")
    .select("id, status, candidates(name, email)")
    .in("id", ids);

  const typedSessions = (sessions ?? []) as unknown as SessionRow[];

  if (typedSessions.length !== ids.length) {
    return NextResponse.json(
      { error: "選択した候補者の一部が見つかりませんでした。" },
      { status: 404 }
    );
  }

  const candidateResults = await Promise.all(
    typedSessions.map(async (s) => {
      const { fieldScores } = await computeSessionFieldScores(supabase, s.id);
      return {
        sessionId: s.id,
        name: s.candidates?.name ?? "-",
        email: s.candidates?.email ?? "-",
        fieldScores,
        overallScore: overallAverage(fieldScores),
      };
    })
  );

  let comparisonSummary: string | null = null;
  try {
    comparisonSummary = await generateComparisonSummary({
      candidates: candidateResults.map((c) => ({ name: c.name, fieldScores: c.fieldScores })),
    });
  } catch {
    // AI比較コメントの生成に失敗しても、表・グラフ用のデータ自体は返す
  }

  return NextResponse.json({
    candidates: candidateResults,
    comparisonSummary,
  });
}