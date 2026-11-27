import { NextRequest } from "next/server";
import { AuthoringError, handleAuthoring, loadCourseForActor, resolveActor } from "@/lib/trainingAuthoring";
import { appendCourse, getCurriculum, loadEditableCurriculum } from "@/lib/trainingCurriculum";

/**
 * POST /api/training/authoring/curricula/[curriculumId]/courses
 * カリキュラムの末尾にテストを1つ足す。body: { courseId }
 */
export async function POST(req: NextRequest, { params }: { params: { curriculumId: string } }) {
  return handleAuthoring(async () => {
    const actor = await resolveActor(req);
    await loadEditableCurriculum(actor, params.curriculumId);
    const body = (await req.json().catch(() => ({}))) as { courseId?: string };
    if (!body.courseId) throw new AuthoringError("テストを選んでください。", 400);
    await loadCourseForActor(actor, body.courseId, { edit: false });
    await appendCourse(params.curriculumId, body.courseId);
    return { curriculum: await getCurriculum(params.curriculumId) };
  });
}
