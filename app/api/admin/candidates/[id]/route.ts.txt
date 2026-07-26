import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/adminAuth";

/**
 * PATCH /api/admin/candidates/[id]
 * 既存候補者の属性(年齢・FP実務経験・FP資格・区分)を更新する。
 * 既に登録済みの候補者に、あとから属性を追加・修正するために使う。
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const body = (await req.json().catch(() => ({}))) as {
    age?: number | string | null;
    fpExperience?: string | null;
    fpLicense?: string | null;
    fpAffiliation?: string | null;
  };

  const ageNumber =
    body.age === "" || body.age === undefined || body.age === null
      ? null
      : Number(body.age);

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("candidates")
    .update({
      age: ageNumber,
      fp_experience: body.fpExperience || null,
      fp_license: body.fpLicense || null,
      fp_affiliation: body.fpAffiliation || null,
    })
    .eq("id", params.id)
    .select(
      "id, name, email, invite_token, created_at, age, fp_experience, fp_license, fp_affiliation"
    )
    .single();

  if (error) {
    return NextResponse.json({ error: "更新に失敗しました: " + error.message }, { status: 400 });
  }

  return NextResponse.json({ candidate: data });
}