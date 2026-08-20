import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/adminAuth";

/**
 * PATCH /api/admin/candidates/[id]
 * 既存候補者の氏名・メールアドレス・属性(年齢・FP実務経験・FP資格・区分・生年月日)を更新する。
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    email?: string;
    age?: number | string | null;
    fpExperience?: string | null;
    fpLicense?: string | null;
    fpAffiliation?: string | null;
    birthdate?: string | null;
    strengths?: string[] | null;
  };

  const ageNumber =
    body.age === "" || body.age === undefined || body.age === null
      ? null
      : Number(body.age);

  const supabase = getSupabaseServerClient();

  const updatePayload: Record<string, unknown> = {
    age: ageNumber,
    fp_experience: body.fpExperience || null,
    fp_license: body.fpLicense || null,
    fp_affiliation: body.fpAffiliation || null,
    birthdate: body.birthdate || null,
    strengths: body.strengths && body.strengths.length > 0 ? body.strengths : null,
  };

  const trimmedName = body.name?.trim();
  const trimmedEmail = body.email?.trim();
  if (trimmedName) updatePayload.name = trimmedName;
  if (trimmedEmail) updatePayload.email = trimmedEmail;

  const { data, error } = await supabase
    .from("candidates")
    .update(updatePayload)
    .eq("id", params.id)
    .select(
      "id, name, email, invite_token, created_at, age, fp_experience, fp_license, fp_affiliation, birthdate, strengths"
    )
    .single();

  if (error) {
    const message =
      error.code === "23505"
        ? "このメールアドレスは既に登録されています。"
        : "更新に失敗しました: " + error.message;
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // ロジカルテスト側の氏名・メールも同期する(紐付いている場合)
  if (trimmedName || trimmedEmail) {
    const logicUpdate: Record<string, unknown> = {};
    if (trimmedName) logicUpdate.name = trimmedName;
    if (trimmedEmail) logicUpdate.email = trimmedEmail;
    await supabase.from("logic_candidates").update(logicUpdate).eq("main_candidate_id", params.id);
  }

  return NextResponse.json({ candidate: data });
}

/**
 * DELETE /api/admin/candidates/[id]
 * 候補者を削除する。関連する受験データ(両テスト分)もすべて削除する。
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const supabase = getSupabaseServerClient();
  const candidateId = params.id;

  // 金融リテラシーチェックテスト側のデータを削除
  const { data: sessions } = await supabase
    .from("exam_sessions")
    .select("id")
    .eq("candidate_id", candidateId);
  const sessionIds = (sessions ?? []).map((s) => s.id);
  if (sessionIds.length > 0) {
    await supabase.from("answers").delete().in("session_id", sessionIds);
    await supabase.from("reports").delete().in("session_id", sessionIds);
    await supabase.from("exam_sessions").delete().in("id", sessionIds);
  }

  // ロジカルシンキング適性テスト側のデータを削除
  const { data: logicCandidate } = await supabase
    .from("logic_candidates")
    .select("id")
    .eq("main_candidate_id", candidateId)
    .maybeSingle();

  if (logicCandidate) {
    const { data: logicSessions } = await supabase
      .from("logic_exam_sessions")
      .select("id")
      .eq("candidate_id", logicCandidate.id);
    const logicSessionIds = (logicSessions ?? []).map((s) => s.id);
    if (logicSessionIds.length > 0) {
      await supabase.from("logic_answers").delete().in("session_id", logicSessionIds);
      await supabase.from("logic_reports").delete().in("session_id", logicSessionIds);
      await supabase.from("logic_exam_sessions").delete().in("id", logicSessionIds);
    }
    await supabase.from("logic_candidates").delete().eq("id", logicCandidate.id);
  }

  const { error } = await supabase.from("candidates").delete().eq("id", candidateId);
  if (error) {
    return NextResponse.json(
      { error: "削除に失敗しました: " + error.message },
      { status: 400 }
    );
  }

  return NextResponse.json({ success: true });
}