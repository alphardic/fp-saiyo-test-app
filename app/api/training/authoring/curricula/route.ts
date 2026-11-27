import { NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { AuthoringError, handleAuthoring, resolveActor } from "@/lib/trainingAuthoring";
import { createCurriculum, listCurricula } from "@/lib/trainingCurriculum";

/**
 * GET /api/training/authoring/curricula
 * 自分が作ったカリキュラムの一覧と、カリキュラムに入れられるテスト(自分が作ったもの + 配布中のもの)を返す。
 */
export async function GET(req: NextRequest) {
  return handleAuthoring(async () => {
    const actor = await resolveActor(req);
    const curricula = await listCurricula(actor.kind === "author" ? { authorEmployeeId: actor.employeeId } : {});
    const supabase = getSupabaseServerClient();
    const { data: courses } = await supabase
      .from("training_courses")
      .select("id, name, status, author_employee_id")
      .in("status", ["draft", "rejected", "pending", "active"])
      .order("created_at", { ascending: false });
    const selectable = (courses ?? [])
      .filter((c) => c.status === "active" || (actor.kind === "author" && c.author_employee_id === actor.employeeId))
      .map((c) => ({ id: c.id, name: c.name, status: c.status }));
    return { curricula, courses: selectable };
  });
}

/**
 * POST /api/training/authoring/curricula
 * カリキュラムを新しく作る。body: { name, description? }
 */
export async function POST(req: NextRequest) {
  return handleAuthoring(async () => {
    const actor = await resolveActor(req);
    if (actor.kind !== "author") throw new AuthoringError("社員用ページからログインしてください。", 400);
    const body = (await req.json().catch(() => ({}))) as { name?: string; description?: string };
    const name = body.name?.trim();
    if (!name) throw new AuthoringError("カリキュラム名を入力してください。", 400);
    const id = await createCurriculum({
      name,
      description: body.description?.trim() || null,
      authorEmployeeId: actor.employeeId,
    });
    return { curriculumId: id };
  });
}
