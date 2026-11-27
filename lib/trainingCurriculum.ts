import { getSupabaseServerClient } from "@/lib/supabase/server";
import { AuthoringError, type Actor } from "@/lib/trainingAuthoring";
import { loadVideoStatusesForEnrollments } from "@/lib/trainingVideo";

/**
 * カリキュラム = 社内テスト(動画つきを含む)を順番に並べたもの。
 * 受講者はカリキュラム専用のページ(/training/curriculum/[token])で、上から順に受講する。
 * 前のテストに合格すると、次のテストに進める。
 */

/** 作問APIと同じ形でエラーを返せるよう、AuthoringError の一種にしておく */
export class CurriculumError extends AuthoringError {}

export interface CurriculumItemView {
  courseId: string;
  name: string;
  status: string;
  hasVideo: boolean;
}

export interface CurriculumView {
  id: string;
  name: string;
  description: string | null;
  authorEmployeeId: string | null;
  createdAt: string;
  items: CurriculumItemView[];
}

function missingTable(message: string | undefined): boolean {
  return !!message && /training_curricul|vimeo_uri|does not exist|schema cache/.test(message);
}

const NOT_READY =
  "カリキュラムを使う準備がまだです。管理者に supabase/training_curriculum_migration.sql の実行を依頼してください。";

/** カリキュラムの一覧(並べたテスト付き)。authorEmployeeId を渡すとその人が作ったものだけ */
export async function listCurricula(opts: { authorEmployeeId?: string } = {}): Promise<CurriculumView[]> {
  const supabase = getSupabaseServerClient();
  let query = supabase
    .from("training_curricula")
    .select("id, name, description, author_employee_id, created_at")
    .order("created_at", { ascending: false });
  if (opts.authorEmployeeId) query = query.eq("author_employee_id", opts.authorEmployeeId);
  const { data: curricula, error } = await query;
  if (error) {
    if (missingTable(error.message)) throw new CurriculumError(NOT_READY, 500);
    throw new CurriculumError("カリキュラムの取得に失敗しました: " + error.message, 500);
  }
  const ids = (curricula ?? []).map((c) => c.id);
  const itemsByCurriculum = await loadItems(ids);
  return (curricula ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    authorEmployeeId: c.author_employee_id,
    createdAt: c.created_at,
    items: itemsByCurriculum[c.id] ?? [],
  }));
}

async function loadItems(curriculumIds: string[]): Promise<Record<string, CurriculumItemView[]>> {
  if (curriculumIds.length === 0) return {};
  const supabase = getSupabaseServerClient();
  const { data: items } = await supabase
    .from("training_curriculum_items")
    .select("curriculum_id, course_id, sort_order")
    .in("curriculum_id", curriculumIds)
    .order("sort_order", { ascending: true });
  const courseIds = Array.from(new Set((items ?? []).map((i) => i.course_id)));
  const courses = await loadCourses(courseIds);
  const result: Record<string, CurriculumItemView[]> = {};
  for (const item of items ?? []) {
    const course = courses[item.course_id];
    if (!course) continue;
    (result[item.curriculum_id] ??= []).push({
      courseId: item.course_id,
      name: course.name,
      status: course.status,
      hasVideo: !!course.video_url,
    });
  }
  return result;
}

async function loadCourses(
  courseIds: string[]
): Promise<Record<string, { name: string; status: string; video_url: string | null }>> {
  if (courseIds.length === 0) return {};
  const supabase = getSupabaseServerClient();
  const withVideo = await supabase.from("training_courses").select("id, name, status, video_url").in("id", courseIds);
  const { data } = withVideo.error
    ? await supabase.from("training_courses").select("id, name, status").in("id", courseIds)
    : withVideo;
  return Object.fromEntries(
    ((data ?? []) as { id: string; name: string; status: string; video_url?: string | null }[]).map((c) => [
      c.id,
      { name: c.name, status: c.status, video_url: c.video_url ?? null },
    ])
  );
}

export async function getCurriculum(id: string): Promise<CurriculumView> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("training_curricula")
    .select("id, name, description, author_employee_id, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    if (missingTable(error.message)) throw new CurriculumError(NOT_READY, 500);
    throw new CurriculumError("カリキュラムの取得に失敗しました: " + error.message, 500);
  }
  if (!data) throw new CurriculumError("カリキュラムが見つかりません。", 404);
  const items = await loadItems([id]);
  return {
    id: data.id,
    name: data.name,
    description: data.description,
    authorEmployeeId: data.author_employee_id,
    createdAt: data.created_at,
    items: items[id] ?? [],
  };
}

/** 編集できるのは作成者と管理者だけ */
export async function loadEditableCurriculum(actor: Actor, id: string): Promise<CurriculumView> {
  const curriculum = await getCurriculum(id);
  if (actor.kind === "author" && curriculum.authorEmployeeId !== actor.employeeId) {
    throw new CurriculumError("このカリキュラムを編集する権限がありません。", 403);
  }
  return curriculum;
}

export async function createCurriculum(params: {
  name: string;
  description: string | null;
  authorEmployeeId: string;
}): Promise<string> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("training_curricula")
    .insert({ name: params.name, description: params.description, author_employee_id: params.authorEmployeeId })
    .select("id")
    .single();
  if (error || !data) {
    if (missingTable(error?.message)) throw new CurriculumError(NOT_READY, 500);
    throw new CurriculumError("カリキュラムの作成に失敗しました: " + (error?.message ?? ""), 500);
  }
  return data.id as string;
}

/** 名前・説明・並べるテスト(順番どおりの courseId 一覧)をまとめて保存する */
export async function saveCurriculum(
  id: string,
  params: { name?: string; description?: string | null; courseIds?: string[] }
): Promise<void> {
  const supabase = getSupabaseServerClient();
  const update: Record<string, unknown> = {};
  if (params.name !== undefined) update.name = params.name;
  if (params.description !== undefined) update.description = params.description;
  if (Object.keys(update).length > 0) {
    const { error } = await supabase.from("training_curricula").update(update).eq("id", id);
    if (error) throw new CurriculumError("保存に失敗しました: " + error.message, 500);
  }
  if (params.courseIds !== undefined) {
    const courseIds = Array.from(new Set(params.courseIds));
    const { error: delError } = await supabase.from("training_curriculum_items").delete().eq("curriculum_id", id);
    if (delError) throw new CurriculumError("保存に失敗しました: " + delError.message, 500);
    if (courseIds.length > 0) {
      const { error } = await supabase
        .from("training_curriculum_items")
        .insert(courseIds.map((courseId, i) => ({ curriculum_id: id, course_id: courseId, sort_order: i + 1 })));
      if (error) throw new CurriculumError("保存に失敗しました: " + error.message, 500);
    }
  }
}

/** カリキュラムの末尾にテストを1つ足す(すでに入っていれば何もしない) */
export async function appendCourse(curriculumId: string, courseId: string): Promise<void> {
  const current = await getCurriculum(curriculumId);
  if (current.items.some((i) => i.courseId === courseId)) return;
  await saveCurriculum(curriculumId, { courseIds: [...current.items.map((i) => i.courseId), courseId] });
}

/**
 * 社員をカリキュラムに招待する。カリキュラム専用のリンク(token)を作り、
 * 配布中のテストそれぞれの受講枠(training_enrollments)も作る。
 */
export async function inviteToCurriculum(
  curriculumId: string,
  employeeIds: string[],
  invitedBy: string
): Promise<void> {
  const supabase = getSupabaseServerClient();
  if (employeeIds.length === 0) return;
  const { error } = await supabase
    .from("training_curriculum_enrollments")
    .upsert(
      employeeIds.map((employeeId) => ({ curriculum_id: curriculumId, employee_id: employeeId, invited_by: invitedBy })),
      { onConflict: "curriculum_id,employee_id", ignoreDuplicates: true }
    );
  if (error) {
    if (missingTable(error.message)) throw new CurriculumError(NOT_READY, 500);
    throw new CurriculumError("招待に失敗しました: " + error.message, 500);
  }
  const curriculum = await getCurriculum(curriculumId);
  await ensureCourseEnrollments(curriculum, employeeIds, invitedBy);
}

async function ensureCourseEnrollments(curriculum: CurriculumView, employeeIds: string[], invitedBy: string) {
  const activeCourseIds = curriculum.items.filter((i) => i.status === "active").map((i) => i.courseId);
  if (activeCourseIds.length === 0 || employeeIds.length === 0) return;
  const supabase = getSupabaseServerClient();
  await supabase.from("training_enrollments").upsert(
    employeeIds.flatMap((employeeId) =>
      activeCourseIds.map((courseId) => ({ course_id: courseId, employee_id: employeeId, invited_by: invitedBy }))
    ),
    { onConflict: "course_id,employee_id", ignoreDuplicates: true }
  );
}

export interface ProgressItem {
  courseId: string;
  name: string;
  /** 配布中なら受講できる。下書きなどは「準備中」 */
  available: boolean;
  hasVideo: boolean;
  videoCompleted: boolean;
  videoPercent: number;
  passed: boolean;
  attemptCount: number;
  /** 前のテストに合格していないので、まだ受けられない */
  locked: boolean;
  /** 受講ページ /training/[inviteToken] のトークン */
  inviteToken: string | null;
}

/** 社員ごとのカリキュラムの進み具合 */
export async function loadProgress(
  curriculum: CurriculumView,
  employeeIds: string[]
): Promise<Record<string, ProgressItem[]>> {
  const supabase = getSupabaseServerClient();
  const courseIds = curriculum.items.map((i) => i.courseId);
  if (courseIds.length === 0 || employeeIds.length === 0) {
    return Object.fromEntries(employeeIds.map((id) => [id, []]));
  }
  const { data: enrollments } = await supabase
    .from("training_enrollments")
    .select("id, course_id, employee_id, invite_token")
    .in("course_id", courseIds)
    .in("employee_id", employeeIds);
  const enrollmentIds = (enrollments ?? []).map((e) => e.id);
  const [{ data: attempts }, videos] = await Promise.all([
    enrollmentIds.length > 0
      ? supabase
          .from("training_attempts")
          .select("enrollment_id, status, passed")
          .in("enrollment_id", enrollmentIds)
          .eq("status", "submitted")
      : Promise.resolve({ data: [] as { enrollment_id: string; status: string; passed: boolean | null }[] }),
    loadVideoStatusesForEnrollments(supabase, enrollmentIds),
  ]);
  const videoUrls = await loadCourses(courseIds);

  const result: Record<string, ProgressItem[]> = {};
  for (const employeeId of employeeIds) {
    let blocked = false;
    result[employeeId] = curriculum.items.map((item) => {
      const enrollment = (enrollments ?? []).find((e) => e.course_id === item.courseId && e.employee_id === employeeId);
      const mine = (attempts ?? []).filter((a) => enrollment && a.enrollment_id === enrollment.id);
      const passed = mine.some((a) => a.passed);
      const video = enrollment ? videos[enrollment.id] : undefined;
      const currentVideo = videoUrls[item.courseId]?.video_url ?? null;
      const sameVideo = !!video && video.video_url === currentVideo;
      const available = item.status === "active";
      const progress: ProgressItem = {
        courseId: item.courseId,
        name: item.name,
        available,
        hasVideo: item.hasVideo,
        videoCompleted: sameVideo && !!video?.completed_at,
        videoPercent:
          sameVideo && video && video.duration_sec > 0
            ? Math.min(100, Math.floor((video.watched_sec / video.duration_sec) * 100))
            : 0,
        passed,
        attemptCount: mine.length,
        locked: blocked,
        inviteToken: enrollment?.invite_token ?? null,
      };
      // 配布中のテストに合格していなければ、それより後ろは受けられない(準備中のテストは飛ばす)
      if (available && !passed) blocked = true;
      return progress;
    });
  }
  return result;
}

/** 受講者向け: カリキュラム専用リンクの token から、カリキュラムと自分の進み具合を返す */
export async function getCurriculumForToken(token: string) {
  const supabase = getSupabaseServerClient();
  const { data: enrollment, error } = await supabase
    .from("training_curriculum_enrollments")
    .select("curriculum_id, employee_id, invited_by")
    .eq("token", token)
    .maybeSingle();
  if (error || !enrollment) throw new CurriculumError("無効なリンクです。", 404);

  const curriculum = await getCurriculum(enrollment.curriculum_id);
  // 招待のあとに配布が始まったテストの受講枠も、ここで作っておく
  await ensureCourseEnrollments(curriculum, [enrollment.employee_id], enrollment.invited_by ?? "curriculum");
  const progress = await loadProgress(curriculum, [enrollment.employee_id]);
  const { data: employee } = await supabase
    .from("employees")
    .select("name")
    .eq("id", enrollment.employee_id)
    .maybeSingle();

  return {
    employeeName: employee?.name ?? "",
    name: curriculum.name,
    description: curriculum.description,
    items: progress[enrollment.employee_id] ?? [],
  };
}
