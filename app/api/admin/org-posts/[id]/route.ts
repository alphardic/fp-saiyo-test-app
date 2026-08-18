import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/adminAuth";
import { JOB_ROLES } from "@/lib/aiGrading";

/**
 * PATCH /api/admin/org-posts/[id]
 * 配属ポストを編集する。
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
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
    .update({
      title,
      department: body.department || null,
      role_category: body.role_category || null,
    })
    .eq("id", params.id)
    .select("id, title, department, role_category, created_at")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "更新に失敗しました: " + (error?.message ?? "") },
      { status: 400 }
    );
  }

  return NextResponse.json({ post: data });
}

/**
 * DELETE /api/admin/org-posts/[id]
 * 配属ポストを削除する(配属中の社員は自動的に配属解除される)。
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("org_posts").delete().eq("id", params.id);

  if (error) {
    return NextResponse.json({ error: "削除に失敗しました: " + error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
