import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/adminAuth";

/**
 * POST /api/admin/candidates
 * 管理画面から候補者を新規登録する。
 * age/fp_experience/fp_license/fp_affiliationは比較分析の絞り込みに使う属性で、任意入力。
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
  };
  const name = body.name?.trim();
  const email = body.email?.trim();

  if (!name || !email) {
    return NextResponse.json(
      { error: "名前とメールアドレスを入力してください。" },
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
    })
    .select(
      "id, name, email, invite_token, created_at, age, fp_experience, fp_license, fp_affiliation"
    )
    .single();

  if (error) {
    const message =
      error.code === "23505"
        ? "このメールアドレスは既に登録されています。"
        : "登録に失敗しました: " + error.message;
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({ candidate: data });
}