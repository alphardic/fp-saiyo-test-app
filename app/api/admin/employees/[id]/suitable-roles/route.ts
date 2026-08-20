import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/adminAuth";
import { getKyuseiKigaku, getRokuseiSenjutsu } from "@/lib/fortune";
import { generateComprehensiveReport } from "@/lib/aiGrading";

/**
 * POST /api/admin/employees/[id]/suitable-roles
 * 社員のMBTI・九星気学・六星占術から適性職種(★評価)をAIで生成し、
 * employees.suitable_roles に保存する(配属シミュレーションで使うためのキャッシュ)。
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const supabase = getSupabaseServerClient();

  const { data: employee, error } = await supabase
    .from("employees")
    .select("id, name, mbti, birthdate, strengths")
    .eq("id", params.id)
    .single();

  if (error || !employee) {
    return NextResponse.json({ error: "社員が見つかりません。" }, { status: 404 });
  }

  if (!employee.mbti || !employee.birthdate) {
    return NextResponse.json(
      { error: "MBTIまたは生年月日が未登録のため、適性職種を生成できません。" },
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

    const generatedAt = new Date().toISOString();

    const { error: updateError } = await supabase
      .from("employees")
      .update({
        suitable_roles: report.suitableRoles,
        suitable_roles_generated_at: generatedAt,
      })
      .eq("id", params.id);

    if (updateError) {
      return NextResponse.json(
        { error: "保存に失敗しました: " + updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ suitableRoles: report.suitableRoles, generatedAt });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          "適性職種の生成に失敗しました: " +
          (e instanceof Error ? e.message : String(e)),
      },
      { status: 500 }
    );
  }
}
