import { NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { AuthoringError, handleAuthoring, resolveActor } from "@/lib/trainingAuthoring";

/**
 * GET /api/training/authoring/me
 * 作問用リンクの持ち主(社員)の氏名と、その社員が作ったテストの一覧を返す。
 */
export async function GET(req: NextRequest) {
  return handleAuthoring(async () => {
    const actor = await resolveActor(req);
    if (actor.kind !== "author") {
      throw new AuthoringError("作問用リンクからアクセスしてください。", 400);
    }
    const supabase = getSupabaseServerClient();
    const { data: courses } = await supabase
      .from("training_courses")
      .select("id, name, status, review_comment, submitted_at, decided_at, created_at")
      .eq("author_employee_id", actor.employeeId)
      .order("created_at", { ascending: false });
    return { name: actor.name, courses: courses ?? [] };
  });
}
