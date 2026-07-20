import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/adminAuth";
import { generateOverallSummary } from "@/lib/aiGrading";
import { FIELDS } from "@/lib/types";

interface AnswerRow {
  question_id: string;
  candidate_answer: string | null;
  is_correct: boolean | null;
  ai_score: number | null;
  ai_grading_notes: string | null;
  questions: {
    field: string;
    type: string;
    question: string;
    choices: string[] | null;
  } | null;
}

interface SessionRow {
  id: string;
  status: string;
  submitted_at: string | null;
  candidate_id: string;
  candidates: { name: string; email: string } | null;
}

/**
 * GET /api/admin/sessions/[id]/report
 * 分野別スコアを集計し、AIによる総評(reportsテーブルにキャッシュ)を添えて返す。
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
    .select("id, status, submitted_at, candidate_id, candidates(name, email)")
    .eq("id", sessionId)
    .maybeSingle();

  const typedSession = session as unknown as SessionRow | null;

  if (!typedSession) {
    return NextResponse.json(
      { error: "受験セッションが見つかりません。" },
      { status: 404 }
    );
  }

  const { data: answers } = await supabase
    .from("answers")
    .select(
      "question_id, candidate_answer, is_correct, ai_score, ai_grading_notes, questions(field, type, question, choices)"
    )
    .eq("session_id", sessionId);

  const typedAnswers = (answers ?? []) as unknown as AnswerRow[];

  // 分野別スコアを集計(選択式は正誤を100/0点、記述式はAIスコアをそのまま使い、分野内で平均)
  const fieldTotals = new Map<string, { sum: number; count: number }>();
  for (const a of typedAnswers) {
    const field = a.questions?.field;
    if (!field) continue;
    const score =
      a.questions?.type === "選択式" ? (a.is_correct ? 100 : 0) : a.ai_score ?? 0;
    const cur = fieldTotals.get(field) ?? { sum: 0, count: 0 };
    cur.sum += score;
    cur.count += 1;
    fieldTotals.set(field, cur);
  }

  const fieldScores: Record<string, number> = {};
  for (const field of FIELDS) {
    const t = fieldTotals.get(field);
    fieldScores[field] = t ? Math.round(t.sum / t.count) : 0;
  }

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

  const questionBreakdown = typedAnswers.map((a) => ({
    field: a.questions?.field ?? "-",
    type: a.questions?.type ?? "-",
    question: a.questions?.question ?? "",
    candidateAnswer: a.candidate_answer,
    isCorrect: a.is_correct,
    aiScore: a.ai_score,
    aiNotes: a.ai_grading_notes,
  }));

  return NextResponse.json({
    candidateName: typedSession.candidates?.name ?? "-",
    candidateEmail: typedSession.candidates?.email ?? "-",
    submittedAt: typedSession.submitted_at,
    fieldScores,
    overallSummary,
    questionBreakdown,
  });
}