import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/adminAuth";

/**
 * GET /api/admin/training
 * 分野別社内テストのコース一覧 + 全社員の受講状況(招待・受験回数・合否)をまとめて返す。
 */
export async function GET(req: NextRequest) {
  const authResult = await requireAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const supabase = getSupabaseServerClient();

  const { data: courses, error: coursesError } = await supabase
    .from("training_courses")
    .select("id, name, description, status, created_at")
    .eq("status", "active")
    .order("created_at", { ascending: true });

  if (coursesError) {
    return NextResponse.json({ error: "コースの取得に失敗しました。" }, { status: 500 });
  }

  const { data: employees, error: employeesError } = await supabase
    .from("employees")
    .select("id, name, department")
    .order("created_at", { ascending: false });

  if (employeesError) {
    return NextResponse.json({ error: "社員データの取得に失敗しました。" }, { status: 500 });
  }

  const { data: enrollments } = await supabase
    .from("training_enrollments")
    .select("id, course_id, employee_id, invite_token, created_at");

  const enrollmentIds = (enrollments ?? []).map((e) => e.id);
  let attempts: {
    id: string;
    enrollment_id: string;
    status: string;
    score: number | null;
    total: number | null;
    passed: boolean | null;
    submitted_at: string | null;
  }[] = [];

  if (enrollmentIds.length > 0) {
    const { data: attemptsData } = await supabase
      .from("training_attempts")
      .select("id, enrollment_id, status, score, total, passed, submitted_at")
      .in("enrollment_id", enrollmentIds)
      .order("submitted_at", { ascending: false });
    attempts = attemptsData ?? [];
  }

  return NextResponse.json({
    courses: courses ?? [],
    employees: employees ?? [],
    enrollments: enrollments ?? [],
    attempts,
  });
}
