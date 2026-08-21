import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/adminAuth";

/**
 * GET /api/admin/dashboard
 * 管理画面用: 候補者一覧 + 受験セッション一覧 + ロジカルテストの状況をまとめて返す。
 */
export async function GET(req: NextRequest) {
  const authResult = await requireAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const supabase = getSupabaseServerClient();

  const { data: candidates, error: candidateError } = await supabase
    .from("candidates")
    .select(
      "id, name, email, invite_token, created_at, age, fp_experience, fp_license, fp_affiliation, invited_by, birthdate, hired_employee_id, strengths, strengths_requested_at"
    )
    .order("created_at", { ascending: false });

  const { data: sessions, error: sessionError } = await supabase
    .from("exam_sessions")
    .select("id, status, submitted_at, candidate_id, candidates(name, email)")
    .order("submitted_at", { ascending: false });

  if (candidateError || sessionError) {
    return NextResponse.json(
      { error: "データの取得に失敗しました。" },
      { status: 500 }
    );
  }

  const candidateIds = (candidates ?? []).map((c) => c.id);

  let logicCandidates: {
    id: string;
    main_candidate_id: string | null;
    invite_token: string;
    mbti: string | null;
    created_at: string;
    invited_by: string | null;
  }[] = [];
  let logicSessions: { id: string; candidate_id: string; status: string }[] = [];

  if (candidateIds.length > 0) {
    const { data: logicCandidatesData } = await supabase
      .from("logic_candidates")
      .select("id, main_candidate_id, invite_token, mbti, created_at, invited_by")
      .in("main_candidate_id", candidateIds);
    logicCandidates = logicCandidatesData ?? [];

    const logicCandidateIds = logicCandidates.map((c) => c.id);
    if (logicCandidateIds.length > 0) {
      const { data: logicSessionsData } = await supabase
        .from("logic_exam_sessions")
        .select("id, candidate_id, status")
        .in("candidate_id", logicCandidateIds);
      logicSessions = logicSessionsData ?? [];
    }
  }

  return NextResponse.json({ candidates, sessions, logicCandidates, logicSessions });
}