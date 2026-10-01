import { NextRequest } from "next/server";
import {
  AuthoringError,
  handleAuthoring,
  loadActiveRules,
  loadCourseForActor,
  resolveActor,
  toCourseContext,
} from "@/lib/trainingAuthoring";
import { proposeOutline } from "@/lib/trainingAuthoringAI";

/**
 * POST /api/training/authoring/courses/[courseId]/outline
 * 資料ノートから知識ポイントの案をAIに作らせて返す(保存はしない。画面で確認・編集してから保存する)。
 */
export async function POST(req: NextRequest, { params }: { params: { courseId: string } }) {
  return handleAuthoring(async () => {
    const actor = await resolveActor(req);
    const course = await loadCourseForActor(actor, params.courseId, { edit: true });
    if (!course.source_notes.trim() && !course.description?.trim()) {
      throw new AuthoringError("先にテストの説明か資料を入力してください。", 400);
    }
    const body = (await req.json().catch(() => ({}))) as { pointCount?: number };
    const pointCount = Math.min(40, Math.max(3, Math.round(body.pointCount ?? 20)));

    const points = await proposeOutline({
      course: toCourseContext(course),
      rules: await loadActiveRules(),
      pointCount,
    });
    return {
      points: points.map((p) => ({
        key: "p" + crypto.randomUUID().slice(0, 8),
        label: p.label.trim(),
        summary: p.summary.trim(),
      })),
    };
  });
}
