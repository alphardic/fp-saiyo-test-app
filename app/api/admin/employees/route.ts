import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/adminAuth";

/**
 * GET /api/admin/employees
 * 社員一覧を取得する。
 */
export async function GET(req: NextRequest) {
  const authResult = await requireAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const supabase = getSupabaseServerClient();

  const { data: employees, error } = await supabase
    .from("employees")
    .select("id, name, email, department, birthdate, mbti, notes, invited_by, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "データの取得に失敗しました。" }, { status: 500 });
  }

  return NextResponse.json({ employees });
}

/**
 * POST /api/admin/employees
 * 社員を新規登録する。
 */
export async function POST(req: NextRequest) {
  const authResult = await requireAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const body = (await req.json()) as {
    name?: string;
    email?: string | null;
    department?: string | null;
    birthdate?: string | null;
    mbti?: string | null;
    notes?: string | null;
  };

  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "氏名を入力してください。" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();

  const { data, error } = await supabase
    .from("employees")
    .insert({
      name,
      email: body.email || null,
      department: body.department || null,
      birthdate: body.birthdate || null,
      mbti: body.mbti || null,
      notes: body.notes || null,
      invited_by: authResult.email,
    })
    .select("id, name, email, department, birthdate, mbti, notes, invited_by, created_at")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "登録に失敗しました: " + (error?.message ?? "") },
      { status: 400 }
    );
  }

  return NextResponse.json({ employee: data });
}