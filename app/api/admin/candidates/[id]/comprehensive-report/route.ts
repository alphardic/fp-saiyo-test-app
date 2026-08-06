import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/adminAuth";
import { getKyuseiKigaku, getRokuseiSenjutsu } from "@/lib/fortune";
import { generateComprehensiveReport } from "@/lib/aiGrading";

/**
 * POST /api/admin/candidates/[id]/comprehensive-report
 * 候補者のMBTI・九星気学・六星占術(・任意でテスト結果の総評)をもとに、
 * AIで総合レポートを生成して返す。
 * body: { testSummary?: string } - 呼び出し側(画面)が持っているテスト総評があれば渡す。
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
    .select("id, name, birthdate")
    .eq("id", params.id)
    .single();

  if (candidateError || !candidate) {
    return NextResponse.json({ error: "候補者が見つかりません。" }, { status: 404 });
  }

  if (!candidate.birthdate) {
    return NextResponse.json(
      { error: "生年月日が未登録のため、レポートを生成できません。候補者を編集して生年月日を入力してください。" },
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
          "MBTIが未登録のため、レポートを生成できません(ロジカルシンキング適性テストでMBTIを選択してもらう必要があります)。",
      },
      { status: 400 }
    );
  }

  const birthdate = new Date(candidate.birthdate);
  const kyuseiStar = getKyuseiKigaku(birthdate);
  const rokusei = getRokuseiSenjutsu(birthdate);

  if (!kyuseiStar || !rokusei) {
    return NextResponse.json(
      { error: "生年月日から占いを計算できませんでした(1950〜2030年生まれのみ対応しています)。" },
      { status: 400 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as { testSummary?: string | null };
  const currentYear = new Date().getFullYear();

  try {
    const report = await generateComprehensiveReport({
      name: candidate.name,
      mbti: logicCandidate.mbti,
      kyuseiStar,
      rokuseiLabel: rokusei.label,
      rokuseiReigou: rokusei.reigou,
      currentYear,
      testSummary: body.testSummary || null,
    });

    return NextResponse.json({
      mbti: logicCandidate.mbti,
      kyuseiStar,
      rokusei,
      report,
    });
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