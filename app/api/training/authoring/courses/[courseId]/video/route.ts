import { NextRequest } from "next/server";
import { handleAuthoring, loadCourseForActor, resolveActor } from "@/lib/trainingAuthoring";
import { requireVimeoUri, withVimeo } from "@/lib/trainingVideoAuthoring";
import { getVideoState } from "@/lib/vimeoApi";

/**
 * GET /api/training/authoring/courses/[courseId]/video
 * アップロードした動画の Vimeo 側の状態(変換が終わって再生できるか・長さ)を返す。
 */
export async function GET(req: NextRequest, { params }: { params: { courseId: string } }) {
  return handleAuthoring(async () => {
    const actor = await resolveActor(req);
    const course = await loadCourseForActor(actor, params.courseId, { edit: false });
    const uri = requireVimeoUri(course);
    const state = await withVimeo(() => getVideoState(uri));
    return { ...state, ready: state.status === "available" };
  });
}
