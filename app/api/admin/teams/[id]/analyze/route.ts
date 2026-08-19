import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/adminAuth";
import { getKyuseiKigaku, getRokuseiSenjutsu } from "@/lib/fortune";
import { generateTeamAnalysis, TeamMemberInput } from "@/lib/aiGrading";

/**
 * POST /api/admin/teams/[id]/analyze
 * チームのメンバー構成(MBTI・占い・適性職種キャッシュ)をもとに、
 * AIでチームの相性傾向・強み・目標達成へのアドバイスを生成し、teamsに保存する。
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const supabase = getSupabaseServerClient();

  const { data: team, error: teamError } = await supabase
    .from("teams")
    .select("id, name, department, goal")
    .eq("id", params.id)
    .single();

  if (teamError || !team) {
    return NextResponse.json({ error: "チームが見つかりません。" }, { status: 404 });
  }

  const { data: members, error: membersError } = await supabase
    .from("employees")
    .select("name, mbti, birthdate, suitable_roles, is_team_leader")
    .eq("team_id", params.id);

  if (membersError) {
    return NextResponse.json({ error: "メンバーの取得に失敗しました。" }, { status: 500 });
  }

  if (!members || members.length === 0) {
    return NextResponse.json(
      { error: "メンバーが1人もいないため分析できません。" },
      { status: 400 }
    );
  }

  const memberInputs: TeamMemberInput[] = members.map((m) => {
    let kyuseiStar: string | null = null;
    let rokuseiLabel: string | null = null;
    let rokuseiReigou = false;
    if (m.birthdate) {
      const birthdate = new Date(m.birthdate);
      kyuseiStar = getKyuseiKigaku(birthdate);
      const rokusei = getRokuseiSenjutsu(birthdate);
      if (rokusei) {
        rokuseiLabel = rokusei.label;
        rokuseiReigou = rokusei.reigou;
      }
    }
    return {
      name: m.name,
      isLeader: !!m.is_team_leader,
      mbti: m.mbti,
      kyuseiStar,
      rokuseiLabel,
      rokuseiReigou,
      suitableRoles: m.suitable_roles,
    };
  });

  try {
    const analysis = await generateTeamAnalysis({
      teamName: team.name,
      department: team.department,
      goal: team.goal,
      members: memberInputs,
    });

    const generatedAt = new Date().toISOString();

    const { error: updateError } = await supabase
      .from("teams")
      .update({ ai_analysis: analysis, ai_analysis_generated_at: generatedAt })
      .eq("id", params.id);

    if (updateError) {
      return NextResponse.json(
        { error: "保存に失敗しました: " + updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ analysis, generatedAt });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          "チーム分析に失敗しました: " + (e instanceof Error ? e.message : String(e)),
      },
      { status: 500 }
    );
  }
}
