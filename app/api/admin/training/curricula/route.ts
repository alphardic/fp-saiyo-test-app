import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/adminAuth";
import { CurriculumError, listCurricula, loadProgress } from "@/lib/trainingCurriculum";

/**
 * GET /api/admin/training/curricula
 * すべてのカリキュラムと、受講者ごとの進み具合を返す。
 */
export async function GET(req: NextRequest) {
  const authResult = await requireAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const supabase = getSupabaseServerClient();
    const curricula = await listCurricula();
    const [{ data: employees }, { data: enrollments }] = await Promise.all([
      supabase.from("employees").select("id, name, department").order("created_at", { ascending: false }),
      supabase.from("training_curriculum_enrollments").select("curriculum_id, employee_id, token, created_at"),
    ]);

    const result = [];
    for (const curriculum of curricula) {
      const mine = (enrollments ?? []).filter((e) => e.curriculum_id === curriculum.id);
      const progress = await loadProgress(
        curriculum,
        mine.map((e) => e.employee_id)
      );
      result.push({
        ...curriculum,
        enrollments: mine.map((e) => ({
          employeeId: e.employee_id,
          token: e.token,
          invitedAt: e.created_at,
          items: progress[e.employee_id] ?? [],
        })),
      });
    }
    return NextResponse.json({ curricula: result, employees: employees ?? [] });
  } catch (e) {
    if (e instanceof CurriculumError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "カリキュラムの取得に失敗しました。" }, { status: 500 });
  }
}
