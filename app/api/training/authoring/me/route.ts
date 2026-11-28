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
      loadMyCourses(supabase, actor.employeeId),
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
          // アプリからアップロードした動画のテストか(「動画の手順を続ける」を出すため)
          fromVideo: !!c.vimeo_uri,
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

/** 自分が作ったテスト。vimeo_uri 列(training_curriculum_migration.sql)が無くても一覧は出す */
async function loadMyCourses(supabase: ReturnType<typeof getSupabaseServerClient>, employeeId: string) {
  const base = "id, name, status, review_comment, published_at, created_at";
  const withVideo = await supabase
    .from("training_courses")
    .select(base + ", vimeo_uri")
    .eq("author_employee_id", employeeId)
    .order("created_at", { ascending: false });
  if (!withVideo.error) {
    return { data: withVideo.data as unknown as (CourseRow & { vimeo_uri: string | null })[] };
  }
  const plain = await supabase
    .from("training_courses")
    .select(base)
    .eq("author_employee_id", employeeId)
    .order("created_at", { ascending: false });
  return { data: (plain.data ?? []).map((c) => ({ ...(c as CourseRow), vimeo_uri: null })) };
}

interface CourseRow {
  id: string;
  name: string;
  status: string;
  review_comment: string | null;
  published_at: string | null;
  created_at: string;
}
