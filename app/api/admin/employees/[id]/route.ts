import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/adminAuth";

/**
 * PATCH /api/admin/employees/[id]
 * 社員情報を更新する。
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const body = (await req.json()) as {
    name?: string;
    email?: string | null;
    department?: string | null;
    position?: string | null;
    manager_id?: string | null;
    birthdate?: string | null;
    mbti?: string | null;
    notes?: string | null;
    strengths?: string[] | null;
  };

  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "氏名を入力してください。" }, { status: 400 });
  }

  if (body.manager_id && body.manager_id === params.id) {
    return NextResponse.json(
      { error: "自分自身を上司に設定することはできません。" },
      { status: 400 }
    );
  }

  const supabase = getSupabaseServerClient();

  const { data, error } = await supabase
    .from("employees")
    .update({
      name,
      email: body.email || null,
      department: body.department || null,
      position: body.position || null,
      manager_id: body.manager_id || null,
      birthdate: body.birthdate || null,
      mbti: body.mbti || null,
      notes: body.notes || null,
      strengths: body.strengths && body.strengths.length > 0 ? body.strengths : null,
    })
    .eq("id", params.id)
    .select(
      "id, name, email, department, position, manager_id, birthdate, mbti, notes, strengths, strengths_requested_at, suitable_roles, suitable_roles_generated_at, team_id, is_team_leader, invited_by, created_at"
    )
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "更新に失敗しました: " + (error?.message ?? "") },
      { status: 400 }
    );
  }

  return NextResponse.json({ employee: data });
}

/**
 * DELETE /api/admin/employees/[id]
 * 社員を削除する。
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const supabase = getSupabaseServerClient();

  // 分野別社内テストの提出済み受験履歴がある社員は削除させない。
  // employees を削除すると training_enrollments → training_attempts → training_answers が
  // ON DELETE CASCADE で連鎖削除され、合格記録が痕跡なく失われるため。
  const { data: enrollments } = await supabase
    .from("training_enrollments")
    .select("id")
    .eq("employee_id", params.id);

  const enrollmentIds = (enrollments ?? []).map((e) => e.id);
  if (enrollmentIds.length > 0) {
    const { count: submittedCount } = await supabase
      .from("training_attempts")
      .select("id", { count: "exact", head: true })
      .in("enrollment_id", enrollmentIds)
      .eq("status", "submitted");

    if ((submittedCount ?? 0) > 0) {
      return NextResponse.json(
        {
          error:
            "この社員には分野別社内テストの受験履歴（提出済み）があるため削除できません。削除すると合格記録も一緒に失われます。",
        },
        { status: 409 }
      );
    }
  }

  const { error } = await supabase.from("employees").delete().eq("id", params.id);

  if (error) {
    return NextResponse.json(
      { error: "削除に失敗しました: " + error.message },
      { status: 400 }
    );
  }

  return NextResponse.json({ success: true });
}