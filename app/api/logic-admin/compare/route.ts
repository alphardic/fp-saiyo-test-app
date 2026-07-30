import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/adminAuth";
import { generateComparisonSummary } from "@/lib/aiGrading";

/**
 * GET /api/logic-admin/compare?ids=<mainCandidateId1,mainCandidateId2,...>
 * ロジカルシンキング適性テストの結果を、複数候補者間で比較する。
 * ids には「通常の候補者(candidates)テーブルのid」を渡す(main_candidate_id経由で紐付け)。
 */
export async function GET(req: NextRequest) {
  const authResult = await requireAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const idsParam = req.nextUrl.searchParams.get("ids") ?? "";
  const candidateIds = idsParam.split(",").filter(Boolean);

  if (candidateIds.length < 2) {
    return NextResponse.json({ error: "比較には2名以上必要です。" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();

  const { data: logicCandidates } = await supabase
    .from("logic_candidates")
    .select("id, main_candidate_id, name, email")
    .in("main_candidate_id", candidateIds);

  if (!logicCandidates || logicCandidates.length === 0) {
    return NextResponse.json(
      { error: "ロジカルテストのデータが見つかりません。" },
      { status: 404 }
    );
  }

  const logicCandidateIds = logicCandidates.map((lc) => lc.id);

  const { data: logicSessions } = await supabase
    .from("logic_exam_sessions")
    .select("id, candidate_id, status")
    .in("candidate_id", logicCandidateIds);

  const completedSessionIds = (logicSessions ?? [])
    .filter((s) => s.status === "completed")
    .map((s) => s.id);

  if (completedSessionIds.length < 2) {
    return NextResponse.json(
      { error: "ロジカルテストを完了している候補者が2名未満です。" },
      { status: 400 }
    );
  }

  const { data: reports } = await supabase
    .from("logic_reports")
    .select("session_id, logic_score, hearing_score, self_persuasion_score")
    .in("session_id", completedSessionIds);

  const candidates = (reports ?? []).map((r) => {
    const session = (logicSessions ?? []).find((s) => s.id === r.session_id);
    const lc = logicCandidates.find((c) => c.id === session?.candidate_id);
    const overallScore = Math.round(
      (Number(r.logic_score) + Number(r.hearing_score) + Number(r.self_persuasion_score)) / 3
    );
    return {
      sessionId: r.session_id,
      name: lc?.name ?? "",
      email: lc?.email ?? "",
      fieldScores: {
        論理的思考力: r.logic_score,
        ヒヤリング力: r.hearing_score,
        自己洗脳力: r.self_persuasion_score,
      },
      overallScore,
    };
  });

  let comparisonSummary: string | null = null;
  try {
    comparisonSummary = await generateComparisonSummary({
      candidates: candidates.map((c) => ({ name: c.name, fieldScores: c.fieldScores })),
    });
  } catch {
    comparisonSummary = null;
  }

  return NextResponse.json({ candidates, comparisonSummary });
}