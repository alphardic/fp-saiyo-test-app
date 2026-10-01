import { NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { AuthoringError, handleAuthoring, resolveActor } from "@/lib/trainingAuthoring";

/**
 * POST /api/training/authoring/courses
 * 社員が新しい社内テストを下書きとして作成する。
 */
export async function POST(req: NextRequest) {
  return handleAuthoring(async () => {
    const actor = await resolveActor(req);
    if (actor.kind !== "author") {
      throw new AuthoringError("作問用リンクからアクセスしてください。", 400);
    }
    const body = (await req.json().catch(() => ({}))) as {
      name?: string;
      description?: string;
      targetAudience?: string;
    };
    const name = body.name?.trim();
    if (!name) throw new AuthoringError("テスト名を入力してください。", 400);

    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("training_courses")
      .insert({
        name,
        description: body.description?.trim() || null,
        target_audience: body.targetAudience?.trim() || null,
        status: "draft",
        author_employee_id: actor.employeeId,
      })
      .select("id")
      .single();
    if (error || !data) {
      throw new AuthoringError("作成に失敗しました: " + (error?.message ?? ""), 500);
    }
    return { courseId: data.id };
  });
}
