import { NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  AuthoringError,
  findEmployeeByEmail,
  handleAuthoring,
  loadCourseForActor,
  resolveActor,
} from "@/lib/trainingAuthoring";

type Params = { params: { courseId: string } };

/**
 * POST /api/training/authoring/courses/[courseId]/reviewers
 * 作成者が同僚(メールアドレスで指定)にテストの確認を依頼する。確認は任意で、配布の条件ではない。
 */
export async function POST(req: NextRequest, { params }: Params) {
  return handleAuthoring(async () => {
    const actor = await resolveActor(req);
    const course = await loadCourseForActor(actor, params.courseId, { edit: false });
    if (course.role !== "owner" || actor.kind !== "author") {
      throw new AuthoringError("確認を依頼できるのはテストの作成者のみです。", 403);
    }

    const body = (await req.json().catch(() => ({}))) as { email?: string };
    const email = body.email?.trim().toLowerCase();
    if (!email) throw new AuthoringError("確認をお願いする人のメールアドレスを入力してください。", 400);

    const reviewer = await findEmployeeByEmail(email);
    if (!reviewer) {
      throw new AuthoringError(
        "このメールアドレスの社員が見つかりません。相手の方に一度、社員用ページで登録してもらってから、もう一度依頼してください。",
        404
      );
    }
    if (reviewer.id === actor.employeeId) {
      throw new AuthoringError("自分以外の人を指定してください。", 400);
    }

    const supabase = getSupabaseServerClient();
    const { error } = await supabase.from("training_course_reviewers").upsert(
      {
        course_id: course.id,
        reviewer_employee_id: reviewer.id,
        status: "requested",
        comment: null,
        requested_by: actor.name,
        requested_at: new Date().toISOString(),
        done_at: null,
      },
      { onConflict: "course_id,reviewer_employee_id" }
    );
    if (error) throw new AuthoringError("依頼に失敗しました: " + error.message, 500);
    return { ok: true, reviewerName: reviewer.name };
  });
}

/**
 * DELETE /api/training/authoring/courses/[courseId]/reviewers?id=...
 * 作成者が確認の依頼を取り消す。
 */
export async function DELETE(req: NextRequest, { params }: Params) {
  return handleAuthoring(async () => {
    const actor = await resolveActor(req);
    const course = await loadCourseForActor(actor, params.courseId, { edit: false });
    if (course.role !== "owner") {
      throw new AuthoringError("依頼を取り消せるのはテストの作成者のみです。", 403);
    }
    const id = req.nextUrl.searchParams.get("id");
    if (!id) throw new AuthoringError("取り消す依頼を指定してください。", 400);

    const supabase = getSupabaseServerClient();
    const { error } = await supabase
      .from("training_course_reviewers")
      .delete()
      .eq("id", id)
      .eq("course_id", course.id);
    if (error) throw new AuthoringError("取り消しに失敗しました: " + error.message, 500);
    return { ok: true };
  });
}
