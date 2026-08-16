import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * GET /api/training/course/[courseId]
 * 自己登録ページ用に、コース名・説明だけを公開情報として返す。
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { courseId: string } }
) {
  const supabase = getSupabaseServerClient();

  const { data: course, error } = await supabase
    .from("training_courses")
    .select("id, name, description")
    .eq("id", params.courseId)
    .eq("status", "active")
    .maybeSingle();

  if (error || !course) {
    return NextResponse.json({ error: "コースが見つかりません。" }, { status: 404 });
  }

  return NextResponse.json(course);
}
