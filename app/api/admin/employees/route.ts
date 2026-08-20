import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/adminAuth";

/**
 * GET /api/admin/employees
 * 社員一覧 + 各社員のロジカルシンキング適性テストの受験状況をまとめて返す。
 */
export async function GET(req: NextRequest) {
  const authResult = await requireAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const supabase = getSupabaseServerClient();

  const { data: employees, error } = await supabase
    .from("employees")
    .select(
      "id, name, email, department, position, manager_id, birthdate, mbti, notes, strengths, suitable_roles, suitable_roles_generated_at, team_id, is_team_leader, invited_by, created_at"
    )
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "データの取得に失敗しました。" }, { status: 500 });
  }

  const employeeIds = (employees ?? []).map((e) => e.id);

  let logicCandidates: {
    id: string;
    employee_id: string | null;
    invite_token: string;
    created_at: string;
    invited_by: string | null;
  }[] = [];
  let logicSessions: { id: string; candidate_id: string; status: string }[] = [];

  if (employeeIds.length > 0) {
    const { data: logicCandidatesData } = await supabase
      .from("logic_candidates")
      .select("id, employee_id, invite_token, created_at, invited_by")
      .in("employee_id", employeeIds);
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

  return NextResponse.json({ employees, logicCandidates, logicSessions });
}

/**
 * POST /api/admin/employees
 * 社員を新規登録する。
 */
export async function POST(req: NextRequest) {
  const authResult = await requireAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const body = (await req.json()) as {
    name?: string;
    email?: string | null;
    department?: string | null;
    position?: string | null;
    manager_id?: string | null;
    birthdate?: string | null;
    mbti?: string | null;
    notes?: string | null;
    strengths?: string[] | null;
  };

  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "氏名を入力してください。" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();

  const { data, error } = await supabase
    .from("employees")
    .insert({
      name,
      email: body.email || null,
      department: body.department || null,
      position: body.position || null,
      manager_id: body.manager_id || null,
      birthdate: body.birthdate || null,
      mbti: body.mbti || null,
      notes: body.notes || null,
      strengths: body.strengths && body.strengths.length > 0 ? body.strengths : null,
      invited_by: authResult.email,
    })
    .select(
      "id, name, email, department, position, manager_id, birthdate, mbti, notes, strengths, suitable_roles, suitable_roles_generated_at, team_id, is_team_leader, invited_by, created_at"
    )
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "登録に失敗しました: " + (error?.message ?? "") },
      { status: 400 }
    );
  }

  return NextResponse.json({ employee: data });
}