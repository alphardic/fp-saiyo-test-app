import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/adminAuth";
import { generateOverallSummary } from "@/lib/aiGrading";
import { computeSessionFieldScores, overallAverage } from "@/lib/scoring";

interface SessionRow {
  id: string;
  status: string;
  submitted_at: string | null;
  candidate_id: string;
  tab_switch_count: number | null;
  tab_away_ms: number | null;
  paste_blocked_count: number | null;
  candidates: { name: string; email: string } | null;
}

/**
 * GET /api/admin/sessions/[id]/report
 * 分野別スコアを集計し、AIによる総評(reportsテーブルにキャッシュ)を添えて返す。
 * あわせて、採点済みの全候補者内での総合点の順位・平均点も返す。
 * ?regenerate=1 を付けると総評を強制的に再生成する。
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const supabase = getSupabaseServerClient();
  const sessionId = params.id;
  const forceRegenerate = req.nextUrl.searchParams.get("regenerate") === "1";

  const { data: session } = await supabase
    .from("exam_sessions")
    .select(
      "id, status, submitted_at, candidate_id, tab_switch_count, tab_away_ms, paste_blocked_count, candidates(name, email)"
    )
    .eq("id", sessionId)
    .maybeSingle();

  const typedSession = session as unknown as SessionRow | null;

  if (!typedSession) {
    return NextResponse.json(
      { error: "受験セッションが見つかりません。" },
      { status: 404 }
    );
  }

  const { fieldScores, questionBreakdown } = await computeSessionFieldScores(
    supabase,
    sessionId
  );
  const thisOverall = overallAverage(fieldScores);

  const { data: existingReport } = await supabase
    .from("reports")
    .select("id, overall_summary")
    .eq("session_id", sessionId)
    .maybeSingle();

  let overallSummary: string | null = existingReport?.overall_summary ?? null;

  if (!overallSummary || forceRegenerate) {
    try {
      const candidateName = typedSession.candidates?.name ?? "候補者";
      const summary = await generateOverallSummary({ candidateName, fieldScores });
      overallSummary = summary;

      if (existingReport) {
        await supabase
          .from("reports")
          .update({
            field_scores: fieldScores,
            overall_summary: summary,
            generated_at: new Date().toISOString(),
          })
          .eq("id", existingReport.id);
      } else {
        await supabase.from("reports").insert({
          session_id: sessionId,
          field_scores: fieldScores,
          overall_summary: summary,
        });
      }
    } catch {
      // AI総評の生成に失敗しても、スコア自体は返す(総評は空のまま)
    }
  } else if (existingReport) {
    await supabase
      .from("reports")
      .update({ field_scores: fieldScores })
      .eq("id", existingReport.id);
  }

  // 採点済みの全候補者内での順位・平均点を計算する
  const { data: gradedSessions } = await supabase
    .from("exam_sessions")
    .select("id")
    .eq("status", "graded");

  let rank: number | null = null;
  let totalCandidates: number | null = null;
  let cohortAverage: number | null = null;

  if (gradedSessions && gradedSessions.length > 0) {
    const overalls = await Promise.all(
      gradedSessions.map(async (s) => {
        if (s.id === sessionId) return thisOverall;
        const { fieldScores: fs } = await computeSessionFieldScores(supabase, s.id);
        return overallAverage(fs);
      })
    );
    totalCandidates = overalls.length;
    cohortAverage = Math.round(overalls.reduce((a, b) => a + b, 0) / overalls.length);
    const sorted = [...overalls].sort((a, b) => b - a);
    rank = sorted.indexOf(thisOverall) + 1;
  }

  return NextResponse.json({
    candidateName: typedSession.candidates?.name ?? "-",
    candidateEmail: typedSession.candidates?.email ?? "-",
    submittedAt: typedSession.submitted_at,
    fieldScores,
    overallSummary,
    questionBreakdown,
    ranking: {
      overallScore: thisOverall,
      rank,
      totalCandidates,
      cohortAverage,
    },
    integrity: {
      tabSwitchCount: typedSession.tab_switch_count ?? 0,
      tabAwaySeconds: Math.round((typedSession.tab_away_ms ?? 0) / 1000),
      pasteBlockedCount: typedSession.paste_blocked_count ?? 0,
    },
  });
}