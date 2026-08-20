import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/adminAuth";
import { getKyuseiKigaku, getRokuseiSenjutsu } from "@/lib/fortune";
import { generateComprehensiveReport } from "@/lib/aiGrading";

/**
 * GET /api/admin/employees/[id]/report
 * 社員のMBTI・九星気学・六星占術をもとに、AIで総合レポートを生成して返す。
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const supabase = getSupabaseServerClient();

  const { data: employee, error } = await supabase
    .from("employees")
    .select(
      "id, name, email, department, position, manager_id, birthdate, mbti, notes, strengths, suitable_roles, suitable_roles_generated_at, team_id, is_team_leader, invited_by, created_at"
    )
    .eq("id", params.id)
    .single();

  if (error || !employee) {
    return NextResponse.json({ error: "社員が見つかりません。" }, { status: 404 });
  }

  if (!employee.mbti || !employee.birthdate) {
    return NextResponse.json(
      { error: "MBTIまたは生年月日が未登録のため、レポートを生成できません。" },
      { status: 400 }
    );
  }

  const birthdate = new Date(employee.birthdate);
  const kyuseiStar = getKyuseiKigaku(birthdate);
  const rokusei = getRokuseiSenjutsu(birthdate);

  if (!kyuseiStar || !rokusei) {
    return NextResponse.json(
      { error: "生年月日から占いを計算できませんでした(1950〜2030年生まれのみ対応しています)。" },
      { status: 400 }
    );
  }

  const currentYear = new Date().getFullYear();

  try {
    const report = await generateComprehensiveReport({
      name: employee.name,
      mbti: employee.mbti,
      kyuseiStar,
      rokuseiLabel: rokusei.label,
      rokuseiReigou: rokusei.reigou,
      currentYear,
      strengths: employee.strengths,
    });

    return NextResponse.json({ employee, kyuseiStar, rokusei, report });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          "レポート生成に失敗しました: " +
          (e instanceof Error ? e.message : String(e)),
      },
      { status: 500 }
    );
  }
}