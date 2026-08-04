import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/adminAuth";

/**
 * POST /api/admin/candidates/[id]/hire
 * 候補者を社員として複製登録する(候補者データはそのまま残す)。
 * MBTI(ロジカルテストで選択済み)と生年月日が揃っていない場合はエラーを返す。
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const supabase = getSupabaseServerClient();

  const { data: candidate, error: candidateError } = await supabase
    .from("candidates")
    .select("id, name, email, birthdate, hired_employee_id")
    .eq("id", params.id)
    .single();

  if (candidateError || !candidate) {
    return NextResponse.json({ error: "候補者が見つかりません。" }, { status: 404 });
  }

  if (candidate.hired_employee_id) {
    return NextResponse.json(
      { error: "この候補者は既に入社処理済みです。" },
      { status: 400 }
    );
  }

  if (!candidate.birthdate) {
    return NextResponse.json(
      { error: "生年月日が未登録のため入社処理できません。候補者を編集して生年月日を入力してください。" },
      { status: 400 }
    );
  }

  const { data: logicCandidate } = await supabase
    .from("logic_candidates")
    .select("mbti")
    .eq("main_candidate_id", candidate.id)
    .maybeSingle();

  if (!logicCandidate?.mbti) {
    return NextResponse.json(
      {
        error:
          "MBTIが未登録のため入社処理できません(ロジカルシンキング適性テストでMBTIを選択してもらう必要があります)。",
      },
      { status: 400 }
    );
  }

  const { data: employee, error: employeeError } = await supabase
    .from("employees")
    .insert({
      name: candidate.name,
      email: candidate.email,
      department: null,
      birthdate: candidate.birthdate,
      mbti: logicCandidate.mbti,
      notes: null,
      invited_by: authResult.email,
    })
    .select("id, name, email, department, birthdate, mbti, notes, invited_by, created_at")
    .single();

  if (employeeError || !employee) {
    return NextResponse.json(
      { error: "社員登録に失敗しました: " + (employeeError?.message ?? "") },
      { status: 500 }
    );
  }

  const { error: updateError } = await supabase
    .from("candidates")
    .update({ hired_employee_id: employee.id })
    .eq("id", candidate.id);

  if (updateError) {
    return NextResponse.json(
      { error: "候補者の更新に失敗しました: " + updateError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ employee });
}