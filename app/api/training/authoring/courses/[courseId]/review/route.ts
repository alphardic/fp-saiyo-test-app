import { NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  AuthoringError,
  handleAuthoring,
  loadCourseForActor,
  resolveActor,
} from "@/lib/trainingAuthoring";

/**
 * POST /api/training/authoring/courses/[courseId]/review
 * 確認を頼まれた人が「確認しました」を記録する(コメントは任意)。
 */
export async function POST(req: NextRequest, { params }: { params: { courseId: string } }) {
  return handleAuthoring(async () => {
    const actor = await resolveActor(req);
    const course = await loadCourseForActor(actor, params.courseId, { edit: false });
    if (course.role !== "reviewer" || actor.kind !== "author") {
      throw new AuthoringError("確認を頼まれた人のみ操作できます。", 403);
    }
    const body = (await req.json().catch(() => ({}))) as { comment?: string };

    const supabase = getSupabaseServerClient();
    const { error } = await supabase
      .from("training_course_reviewers")
      .update({ status: "done", comment: body.comment?.trim() || null, done_at: new Date().toISOString() })
      .eq("course_id", course.id)
      .eq("reviewer_employee_id", actor.employeeId);
    if (error) throw new AuthoringError("保存に失敗しました: " + error.message, 500);
    return { ok: true };
  });
}
