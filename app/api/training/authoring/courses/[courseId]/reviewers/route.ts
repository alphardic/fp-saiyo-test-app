import { NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  AuthoringError,
  findEmployeeByEmail,
  findOrCreateEmployee,
  handleAuthoring,
  isAllowedEmail,
  loadCourseForActor,
  resolveActor,
} from "@/lib/trainingAuthoring";

type Params = { params: { courseId: string } };

/**
 * GET /api/training/authoring/courses/[courseId]/reviewers
 * 確認をお願いできる社員(会社のメールアドレスを持つ社員)の候補一覧を返す。
 */
export async function GET(req: NextRequest, { params }: Params) {
  return handleAuthoring(async () => {
    const actor = await resolveActor(req);
    const course = await loadCourseForActor(actor, params.courseId, { edit: false });
    if (course.role !== "owner" || actor.kind !== "author") {
      throw new AuthoringError("確認を依頼できるのはテストの作成者のみです。", 403);
    }
    const supabase = getSupabaseServerClient();
    const { data } = await supabase.from("employees").select("id, name, email").not("email", "is", null);
    const candidates = (data ?? [])
      .filter((e) => e.id !== actor.employeeId && e.email && isAllowedEmail(e.email.toLowerCase()))
      .map((e) => ({ id: e.id, name: e.name, email: e.email as string }))
      .sort((a, b) => a.name.localeCompare(b.name, "ja"));
    return { candidates };
  });
}

/**
 * POST /api/training/authoring/courses/[courseId]/reviewers
 * 作成者が同僚(一覧から選ぶか、メールアドレスで指定)にテストの確認を依頼する。確認は任意で、配布の条件ではない。
 */
export async function POST(req: NextRequest, { params }: Params) {
  return handleAuthoring(async () => {
    const actor = await resolveActor(req);
    const course = await loadCourseForActor(actor, params.courseId, { edit: false });
    if (course.role !== "owner" || actor.kind !== "author") {
      throw new AuthoringError("確認を依頼できるのはテストの作成者のみです。", 403);
    }

    const body = (await req.json().catch(() => ({}))) as { employeeId?: string; email?: string; name?: string };
    const supabase = getSupabaseServerClient();

    let reviewer: { id: string; name: string } | null = null;
    if (body.employeeId) {
      const { data } = await supabase.from("employees").select("id, name").eq("id", body.employeeId).maybeSingle();
      reviewer = data;
      if (!reviewer) throw new AuthoringError("選んだ社員が見つかりません。", 404);
    } else {
      const email = body.email?.trim().toLowerCase();
      if (!email) throw new AuthoringError("確認をお願いする人を選んでください。", 400);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !isAllowedEmail(email)) {
        throw new AuthoringError("会社のメールアドレス(@alpha-fp.com / @peoples-connect.com)を入力してください。", 400);
      }
      const found = await findEmployeeByEmail(email);
      if (found) {
        reviewer = found;
      } else {
        // まだ社員として登録されていない人: 社員を作っておき、本人が同じメールアドレスで登録すると依頼が見える
        const name = body.name?.trim() || email.split("@")[0];
        const created = await findOrCreateEmployee(name, email);
        reviewer = { id: created.id, name };
      }
    }

    if (reviewer.id === actor.employeeId) {
      throw new AuthoringError("自分以外の人を指定してください。", 400);
    }

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
