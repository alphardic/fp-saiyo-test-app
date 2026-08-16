import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/adminAuth";

/**
 * POST /api/admin/employees/[id]/training-invite
 * 社員向けに分野別社内テスト(コース)の受験リンクを発行する。
 * 既に発行済みなら同じトークンを返す(何度でも同じリンクから再受験できるため)。
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const body = (await req.json().catch(() => ({}))) as { courseId?: string };
  const courseId = body.courseId;

  if (!courseId) {
    return NextResponse.json({ error: "courseIdを指定してください。" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();

  const { data: employee, error: employeeError } = await supabase
    .from("employees")
    .select("id")
    .eq("id", params.id)
    .single();

  if (employeeError || !employee) {
    return NextResponse.json({ error: "社員が見つかりません。" }, { status: 404 });
  }

  const { data: existing } = await supabase
    .from("training_enrollments")
    .select("invite_token")
    .eq("course_id", courseId)
    .eq("employee_id", params.id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ inviteToken: existing.invite_token });
  }

  const { data: created, error: createError } = await supabase
    .from("training_enrollments")
    .insert({
      course_id: courseId,
      employee_id: params.id,
      invited_by: authResult.email,
    })
    .select("invite_token")
    .single();

  if (createError || !created) {
    return NextResponse.json(
      { error: "招待の発行に失敗しました: " + (createError?.message ?? "") },
      { status: 500 }
    );
  }

  return NextResponse.json({ inviteToken: created.invite_token });
}
