import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/adminAuth";

/**
 * POST /api/admin/employees/[id]/assign-post
 * 社員をポストに配属する(postId: null で配属解除)。
 * 1ポストにつき同時に配属できるのは1人まで。
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const body = (await req.json()) as { postId?: string | null };
  const postId = body.postId || null;

  const supabase = getSupabaseServerClient();

  const { data: employee, error: employeeError } = await supabase
    .from("employees")
    .select("id")
    .eq("id", params.id)
    .single();

  if (employeeError || !employee) {
    return NextResponse.json({ error: "社員が見つかりません。" }, { status: 404 });
  }

  if (postId) {
    const { data: post, error: postError } = await supabase
      .from("org_posts")
      .select("id")
      .eq("id", postId)
      .single();

    if (postError || !post) {
      return NextResponse.json({ error: "ポストが見つかりません。" }, { status: 404 });
    }

    const { data: occupant } = await supabase
      .from("employees")
      .select("id")
      .eq("assigned_post_id", postId)
      .neq("id", params.id)
      .maybeSingle();

    if (occupant) {
      return NextResponse.json(
        { error: "このポストは既に他の社員が配属されています。" },
        { status: 400 }
      );
    }
  }

  const { data, error } = await supabase
    .from("employees")
    .update({ assigned_post_id: postId })
    .eq("id", params.id)
    .select("id, assigned_post_id")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "配属の更新に失敗しました: " + (error?.message ?? "") },
      { status: 500 }
    );
  }

  return NextResponse.json({ employee: data });
}
