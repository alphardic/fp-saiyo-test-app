import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/adminAuth";
import { sendReminderEmail } from "@/lib/notify";

/**
 * POST /api/admin/candidates/[id]/remind
 * 未受験・受験中のまま止まっている候補者へ、管理画面のボタン操作でリマインドメールを送る。
 * body: { test: "main" | "logic", url: string }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const body = (await req.json().catch(() => ({}))) as {
    test?: "main" | "logic";
    url?: string;
  };

  if (!body.test || !body.url) {
    return NextResponse.json({ error: "testとurlが必要です。" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();

  const { data: candidate, error: candidateError } = await supabase
    .from("candidates")
    .select("id, name, email")
    .eq("id", params.id)
    .maybeSingle();

  if (candidateError || !candidate) {
    return NextResponse.json({ error: "候補者が見つかりません。" }, { status: 404 });
  }

  if (body.test === "main") {
    const { data: session } = await supabase
      .from("exam_sessions")
      .select("status")
      .eq("candidate_id", candidate.id)
      .maybeSingle();

    if (session?.status === "submitted" || session?.status === "graded") {
      return NextResponse.json(
        { error: "既に提出済みのため、リマインドは送信できません。" },
        { status: 400 }
      );
    }

    const result = await sendReminderEmail({
      candidateName: candidate.name,
      candidateEmail: candidate.email,
      testName: "金融リテラシーチェックテスト",
      examUrl: body.url,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  const { data: logicCandidate } = await supabase
    .from("logic_candidates")
    .select("id")
    .eq("main_candidate_id", candidate.id)
    .maybeSingle();

  if (!logicCandidate) {
    return NextResponse.json(
      { error: "ロジカルテストの招待がまだ発行されていません。" },
      { status: 400 }
    );
  }

  const { data: logicSession } = await supabase
    .from("logic_exam_sessions")
    .select("status")
    .eq("candidate_id", logicCandidate.id)
    .maybeSingle();

  if (logicSession?.status === "completed") {
    return NextResponse.json(
      { error: "既に提出済みのため、リマインドは送信できません。" },
      { status: 400 }
    );
  }

  const result = await sendReminderEmail({
    candidateName: candidate.name,
    candidateEmail: candidate.email,
    testName: "ロジカルシンキング適性テスト",
    examUrl: body.url,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ success: true });
}
