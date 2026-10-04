import { NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  AuthoringError,
  handleAuthoring,
  loadCourseForActor,
  loadQuestions,
  resolveActor,
} from "@/lib/trainingAuthoring";
import { sendAuthoringPublishedNotification } from "@/lib/notify";

/**
 * POST /api/training/authoring/courses/[courseId]/publish
 * 作成者がテストの配布を始める(承認は不要)。配布中は編集できなくなる。
 * 管理者には事後確認用のお知らせメールを送る。
 */
export async function POST(req: NextRequest, { params }: { params: { courseId: string } }) {
  return handleAuthoring(async () => {
    const actor = await resolveActor(req);
    const course = await loadCourseForActor(actor, params.courseId, { edit: false });
    if (course.role !== "owner" || actor.kind !== "author") {
      throw new AuthoringError("配布を始められるのはテストの作成者のみです。", 403);
    }
    if (!["draft", "rejected", "pending"].includes(course.status)) {
      throw new AuthoringError("このテストはすでに配布中です。", 409);
    }

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
      .update({ status: "active", published_at: new Date().toISOString() })
      .eq("id", course.id);
    if (error) throw new AuthoringError("配布の開始に失敗しました: " + error.message, 500);

    await sendAuthoringPublishedNotification({
      courseName: course.name,
      authorName: actor.name,
      reviewUrl: `${req.nextUrl.origin}/admin/training/authoring/${course.id}`,
    });
    return { ok: true, registerPath: `/training/register/${course.id}` };
  });
}
