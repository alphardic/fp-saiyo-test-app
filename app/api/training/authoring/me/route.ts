import { NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { AuthoringError, handleAuthoring, resolveActor } from "@/lib/trainingAuthoring";

export const dynamic = "force-dynamic";

/**
 * GET /api/training/authoring/me
 * ログイン中の社員の氏名、その社員が作ったテスト、確認を頼まれたテストの一覧を返す。
 */
export async function GET(req: NextRequest) {
  return handleAuthoring(async () => {
    const actor = await resolveActor(req);
    if (actor.kind !== "author") {
      throw new AuthoringError("社員用ページからログインしてください。", 400);
    }
    const supabase = getSupabaseServerClient();

    const [{ data: courses }, { data: reviewRows }] = await Promise.all([
      supabase
        .from("training_courses")
        .select("id, name, status, review_comment, published_at, created_at")
        .eq("author_employee_id", actor.employeeId)
        .order("created_at", { ascending: false }),
      supabase
        .from("training_course_reviewers")
        .select("course_id, status, requested_at")
        .eq("reviewer_employee_id", actor.employeeId)
        .order("requested_at", { ascending: false }),
    ]);

    const myCourseIds = (courses ?? []).map((c) => c.id);
    const reviewCourseIds = (reviewRows ?? []).map((r) => r.course_id);

    const [{ data: reviewers }, { data: enrollments }, { data: reviewCourses }] = await Promise.all([
      myCourseIds.length > 0
        ? supabase.from("training_course_reviewers").select("course_id, status").in("course_id", myCourseIds)
        : Promise.resolve({ data: [] as { course_id: string; status: string }[] }),
      myCourseIds.length > 0
        ? supabase.from("training_enrollments").select("course_id").in("course_id", myCourseIds)
        : Promise.resolve({ data: [] as { course_id: string }[] }),
      reviewCourseIds.length > 0
        ? supabase
            .from("training_courses")
            .select("id, name, status, author_employee_id")
            .in("id", reviewCourseIds)
        : Promise.resolve({ data: [] as { id: string; name: string; status: string; author_employee_id: string | null }[] }),
    ]);

    const authorIds = Array.from(
      new Set((reviewCourses ?? []).map((c) => c.author_employee_id).filter(Boolean))
    ) as string[];
    const { data: authors } =
      authorIds.length > 0
        ? await supabase.from("employees").select("id, name").in("id", authorIds)
        : { data: [] as { id: string; name: string }[] };
    const authorName = new Map((authors ?? []).map((a) => [a.id, a.name]));

    return {
      name: actor.name,
      email: actor.email,
      courses: (courses ?? []).map((c) => {
        const rs = (reviewers ?? []).filter((r) => r.course_id === c.id);
        return {
          ...c,
          reviewRequested: rs.length,
          reviewDone: rs.filter((r) => r.status === "done").length,
          enrolledCount: (enrollments ?? []).filter((e) => e.course_id === c.id).length,
        };
      }),
      reviewRequests: (reviewRows ?? []).flatMap((r) => {
        const c = (reviewCourses ?? []).find((x) => x.id === r.course_id);
        if (!c) return [];
        return [
          {
            courseId: c.id,
            name: c.name,
            courseStatus: c.status,
            authorName: c.author_employee_id ? authorName.get(c.author_employee_id) ?? null : null,
            status: r.status,
            requestedAt: r.requested_at,
          },
        ];
      }),
    };
  });
}
