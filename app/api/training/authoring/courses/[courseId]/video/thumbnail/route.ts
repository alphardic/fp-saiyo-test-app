import { NextRequest } from "next/server";
import { AuthoringError, handleAuthoring, loadCourseForActor, resolveActor } from "@/lib/trainingAuthoring";
import { requireVimeoUri, withVimeo } from "@/lib/trainingVideoAuthoring";
import { setVideoThumbnail } from "@/lib/vimeoApi";

const MAX_PNG_BYTES = 5 * 1024 * 1024;

/**
 * POST /api/training/authoring/courses/[courseId]/video/thumbnail
 * 画面で作ったサムネイル画像(PNG)を、Vimeo の動画のサムネイルに設定する。
 * body: { png: "<base64>" }
 */
export async function POST(req: NextRequest, { params }: { params: { courseId: string } }) {
  return handleAuthoring(async () => {
    const actor = await resolveActor(req);
    const course = await loadCourseForActor(actor, params.courseId, { edit: true });
    const uri = requireVimeoUri(course);
    const body = (await req.json().catch(() => ({}))) as { png?: string };
    if (!body.png) throw new AuthoringError("サムネイル画像がありません。", 400);

    const binary = atob(body.png.replace(/^data:image\/png;base64,/, ""));
    if (binary.length > MAX_PNG_BYTES) throw new AuthoringError("サムネイル画像が大きすぎます。", 400);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    await withVimeo(() => setVideoThumbnail(uri, bytes.buffer));
    return { ok: true };
  });
}
