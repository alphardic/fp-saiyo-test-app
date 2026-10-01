import { NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  AuthoringError,
  handleAuthoring,
  loadCourseForActor,
  loadQuestions,
  resolveActor,
} from "@/lib/trainingAuthoring";
import { sendAuthoringSubmittedNotification } from "@/lib/notify";

/**
 * POST /api/training/authoring/courses/[courseId]/submit
 * 作成者がテストの承認を申請する。申請中は作成者は編集できなくなる。
 */
export async function POST(req: NextRequest, { params }: { params: { courseId: string } }) {
  return handleAuthoring(async () => {
    const actor = await resolveActor(req);
    if (actor.kind !== "author") {
      throw new AuthoringError("承認申請は作成者のみ行えます。", 403);
    }
    const course = await loadCourseForActor(actor, params.courseId, { edit: true });

    if (course.outline.length === 0) {
      throw new AuthoringError("知識ポイントが1つもありません。", 400);
    }
    const questions = await loadQuestions(course.id);
    const missing = course.outline.filter((p) => !questions.some((q) => q.group_key === p.key));
    if (missing.length > 0) {
      throw new AuthoringError(
        `問題が作られていない知識ポイントがあります: ${missing.map((p) => p.label).join("、")}`,
        400
      );
    }

    const supabase = getSupabaseServerClient();
    const { error } = await supabase
      .from("training_courses")
      .update({ status: "pending", submitted_at: new Date().toISOString(), review_comment: null })
      .eq("id", course.id);
    if (error) throw new AuthoringError("申請に失敗しました: " + error.message, 500);

    await sendAuthoringSubmittedNotification({
      courseName: course.name,
      authorName: actor.name,
      reviewUrl: `${req.nextUrl.origin}/admin/training/authoring/${course.id}`,
    });
    return { ok: true };
  });
}
