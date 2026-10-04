import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/adminAuth";

/**
 * GET /api/admin/training/authoring
 * 社員が作った社内テスト(作成中・配布中など)の一覧を返す。
 */
export async function GET(req: NextRequest) {
  const authResult = await requireAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const supabase = getSupabaseServerClient();
  const { data: courses, error } = await supabase
    .from("training_courses")
    .select("id, name, status, author_employee_id, outline, submitted_at, published_at, created_at")
    .not("author_employee_id", "is", null)
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: "一覧の取得に失敗しました。" }, { status: 500 });
  }

  const authorIds = Array.from(
    new Set((courses ?? []).map((c) => c.author_employee_id).filter(Boolean))
  ) as string[];
  const courseIds = (courses ?? []).map((c) => c.id);

  const [{ data: authors }, { data: questions }, { data: reviewers }, { data: enrollments }] = await Promise.all([
    authorIds.length > 0
      ? supabase.from("employees").select("id, name").in("id", authorIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    courseIds.length > 0
      ? supabase.from("training_questions").select("course_id").in("course_id", courseIds)
      : Promise.resolve({ data: [] as { course_id: string }[] }),
    courseIds.length > 0
      ? supabase.from("training_course_reviewers").select("course_id, status").in("course_id", courseIds)
      : Promise.resolve({ data: [] as { course_id: string; status: string }[] }),
    courseIds.length > 0
      ? supabase.from("training_enrollments").select("course_id").in("course_id", courseIds)
      : Promise.resolve({ data: [] as { course_id: string }[] }),
  ]);

  const authorName = new Map((authors ?? []).map((a) => [a.id, a.name]));
  return NextResponse.json({
    courses: (courses ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      authorName: c.author_employee_id ? authorName.get(c.author_employee_id) ?? null : null,
      pointCount: Array.isArray(c.outline) ? c.outline.length : 0,
      questionCount: (questions ?? []).filter((q) => q.course_id === c.id).length,
      submittedAt: c.submitted_at,
      publishedAt: c.published_at,
      reviewRequested: (reviewers ?? []).filter((r) => r.course_id === c.id).length,
      reviewDone: (reviewers ?? []).filter((r) => r.course_id === c.id && r.status === "done").length,
      enrolledCount: (enrollments ?? []).filter((e) => e.course_id === c.id).length,
      createdAt: c.created_at,
    })),
  });
}
