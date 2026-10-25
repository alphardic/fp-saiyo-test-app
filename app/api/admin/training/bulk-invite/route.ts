import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/adminAuth";

/**
 * POST /api/admin/training/bulk-invite
 * 複数の社員をまとめて社内テストの受講対象者にする(受験リンクを発行する)。
 * body: { courseId: string, employeeIds: string[] }
 * 既に招待済みの社員はそのまま(同じリンクを使い続ける)。
 */
export async function POST(req: NextRequest) {
  const authResult = await requireAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const body = (await req.json().catch(() => ({}))) as {
    courseId?: string;
    employeeIds?: string[];
  };
  const courseId = body.courseId;
  const employeeIds = (body.employeeIds ?? []).filter(Boolean);

  if (!courseId || employeeIds.length === 0) {
    return NextResponse.json(
      { error: "コースと、招待する社員を指定してください。" },
      { status: 400 }
    );
  }

  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("training_enrollments").upsert(
    employeeIds.map((employeeId) => ({
      course_id: courseId,
      employee_id: employeeId,
      invited_by: authResult.email,
    })),
    { onConflict: "course_id,employee_id", ignoreDuplicates: true }
  );

  if (error) {
    return NextResponse.json(
      { error: "招待の発行に失敗しました: " + error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, count: employeeIds.length });
}
