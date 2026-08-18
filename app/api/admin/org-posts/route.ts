import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/adminAuth";
import { JOB_ROLES } from "@/lib/aiGrading";

/**
 * GET /api/admin/org-posts
 * 配属ポスト一覧を返す。
 */
export async function GET(req: NextRequest) {
  const authResult = await requireAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const supabase = getSupabaseServerClient();

  const { data, error } = await supabase
    .from("org_posts")
    .select("id, title, department, role_category, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "データの取得に失敗しました。" }, { status: 500 });
  }

  return NextResponse.json({ posts: data ?? [] });
}

/**
 * POST /api/admin/org-posts
 * 配属ポストを新規登録する。
 */
export async function POST(req: NextRequest) {
  const authResult = await requireAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const body = (await req.json()) as {
    title?: string;
    department?: string | null;
    role_category?: string | null;
  };

  const title = body.title?.trim();
  if (!title) {
    return NextResponse.json({ error: "タイトルを入力してください。" }, { status: 400 });
  }

  if (body.role_category && !(JOB_ROLES as readonly string[]).includes(body.role_category)) {
    return NextResponse.json({ error: "職種区分の値が不正です。" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();

  const { data, error } = await supabase
    .from("org_posts")
    .insert({
      title,
      department: body.department || null,
      role_category: body.role_category || null,
    })
    .select("id, title, department, role_category, created_at")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "登録に失敗しました: " + (error?.message ?? "") },
      { status: 400 }
    );
  }

  return NextResponse.json({ post: data });
}
