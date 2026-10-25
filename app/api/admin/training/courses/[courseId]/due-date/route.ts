import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/adminAuth";

/**
 * PUT /api/admin/training/courses/[courseId]/due-date
 * 社内テストの受験期限を設定する。body: { dueDate: "YYYY-MM-DD" | null }(null で期限なし)
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: { courseId: string } }
) {
  const authResult = await requireAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const body = (await req.json().catch(() => ({}))) as { dueDate?: string | null };
  const dueDate = body.dueDate || null;

  if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    return NextResponse.json({ error: "期限の日付の形式が正しくありません。" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from("training_courses")
    .update({ due_date: dueDate })
    .eq("id", params.courseId);

  if (error) {
    const missingColumn = error.message.includes("due_date");
    return NextResponse.json(
      {
        error: missingColumn
          ? "期限を保存する準備がまだです。supabase/training_due_date_migration.sql を SQL Editor で実行してください。"
          : "期限の保存に失敗しました: " + error.message,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
