import { NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { AuthoringError, handleAuthoring, resolveActor } from "@/lib/trainingAuthoring";
import { getCurriculum, loadEditableCurriculum, saveCurriculum } from "@/lib/trainingCurriculum";

type Params = { params: { curriculumId: string } };

export async function GET(req: NextRequest, { params }: Params) {
  return handleAuthoring(async () => {
    const actor = await resolveActor(req);
    return { curriculum: await loadEditableCurriculum(actor, params.curriculumId) };
  });
}

/**
 * PATCH /api/training/authoring/curricula/[curriculumId]
 * body: { name?, description?, courseIds?: 並べたい順の courseId 一覧 }
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  return handleAuthoring(async () => {
    const actor = await resolveActor(req);
    await loadEditableCurriculum(actor, params.curriculumId);
    const body = (await req.json().catch(() => ({}))) as {
      name?: string;
      description?: string | null;
      courseIds?: string[];
    };
    if (body.name !== undefined && !body.name.trim()) {
      throw new AuthoringError("カリキュラム名を入力してください。", 400);
    }
    await saveCurriculum(params.curriculumId, {
      name: body.name?.trim(),
      description: body.description === undefined ? undefined : body.description?.trim() || null,
      courseIds: body.courseIds,
    });
    return { curriculum: await getCurriculum(params.curriculumId) };
  });
}

/** DELETE: カリキュラムを削除する(テスト自体は消えない) */
export async function DELETE(req: NextRequest, { params }: Params) {
  return handleAuthoring(async () => {
    const actor = await resolveActor(req);
    await loadEditableCurriculum(actor, params.curriculumId);
    const supabase = getSupabaseServerClient();
    const { error } = await supabase.from("training_curricula").delete().eq("id", params.curriculumId);
    if (error) throw new AuthoringError("削除に失敗しました: " + error.message, 500);
    return { ok: true };
  });
}
