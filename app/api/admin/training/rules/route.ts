import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/adminAuth";

/**
 * GET /api/admin/training/rules
 * 作問ルール(指摘から学習したものを含む)の一覧を返す。
 */
export async function GET(req: NextRequest) {
  const authResult = await requireAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const supabase = getSupabaseServerClient();
  const { data: rules, error } = await supabase
    .from("training_authoring_rules")
    .select("id, rule, source, created_by, source_course_id, active, created_at")
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: "ルールの取得に失敗しました。" }, { status: 500 });
  }

  const courseIds = Array.from(
    new Set((rules ?? []).map((r) => r.source_course_id).filter(Boolean))
  ) as string[];
  const { data: courses } =
    courseIds.length > 0
      ? await supabase.from("training_courses").select("id, name").in("id", courseIds)
      : { data: [] as { id: string; name: string }[] };
  const courseName = new Map((courses ?? []).map((c) => [c.id, c.name]));

  return NextResponse.json({
    rules: (rules ?? []).map((r) => ({
      ...r,
      source_course_name: r.source_course_id ? courseName.get(r.source_course_id) ?? null : null,
    })),
  });
}

/**
 * POST /api/admin/training/rules
 * 管理者が作問ルールを手動で追加する。
 */
export async function POST(req: NextRequest) {
  const authResult = await requireAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const body = (await req.json().catch(() => ({}))) as { rule?: string };
  const rule = body.rule?.trim();
  if (!rule) {
    return NextResponse.json({ error: "ルールを入力してください。" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from("training_authoring_rules")
    .insert({ rule, source: "manual", created_by: authResult.email ?? "管理者" });
  if (error) {
    return NextResponse.json({ error: "追加に失敗しました: " + error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
