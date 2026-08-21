import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/adminAuth";

/**
 * POST /api/admin/candidates
 * 管理画面から候補者を新規登録する。
 * 同時に、ロジカルシンキング適性テストの招待リンクも自動発行する。
 */
export async function POST(req: NextRequest) {
  const authResult = await requireAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const body = (await req.json()) as {
    name?: string;
    email?: string;
    age?: number | string | null;
    fpExperience?: string | null;
    fpLicense?: string | null;
    fpAffiliation?: string | null;
    birthdate?: string | null;
  };

  const name = body.name?.trim();
  const email = body.email?.trim();

  if (!name || !email) {
    return NextResponse.json(
      { error: "名前とメールアドレスを入力してください。" },
      { status: 400 }
    );
  }

  if (!body.birthdate) {
    return NextResponse.json(
      { error: "生年月日を入力してください(占いの計算に使用します)。" },
      { status: 400 }
    );
  }

  const ageNumber =
    body.age === "" || body.age === undefined || body.age === null
      ? null
      : Number(body.age);

  const supabase = getSupabaseServerClient();

  const { data, error } = await supabase
    .from("candidates")
    .insert({
      name,
      email,
      age: ageNumber,
      fp_experience: body.fpExperience || null,
      fp_license: body.fpLicense || null,
      fp_affiliation: body.fpAffiliation || null,
      invited_by: authResult.email,
      birthdate: body.birthdate || null,
    })
    .select(
      "id, name, email, invite_token, created_at, age, fp_experience, fp_license, fp_affiliation, invited_by, birthdate, strengths, strengths_requested_at"
    )
    .single();

  if (error || !data) {
    const message =
      error?.code === "23505"
        ? "このメールアドレスは既に登録されています。"
        : "登録に失敗しました: " + (error?.message ?? "");
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // ロジカルシンキング適性テストの招待も同時に発行する
  let logicInviteToken: string | null = null;
  try {
    const { data: logicCandidate, error: logicError } = await supabase
      .from("logic_candidates")
      .insert({
        name,
        email,
        invite_token: crypto.randomUUID(),
        main_candidate_id: data.id,
        invited_by: authResult.email,
      })
      .select("id, invite_token")
      .single();

    if (!logicError && logicCandidate) {
      await supabase
        .from("logic_exam_sessions")
        .insert({ candidate_id: logicCandidate.id, status: "not_started" });
      logicInviteToken = logicCandidate.invite_token;
    }
  } catch {
    // ロジカルテスト側の発行に失敗しても、通常の候補者登録は成立させる
  }

  return NextResponse.json({ candidate: data, logicInviteToken });
}