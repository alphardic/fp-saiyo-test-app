import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { CurriculumError, inviteToCurriculum } from "@/lib/trainingCurriculum";

/**
 * POST /api/admin/training/curricula/[curriculumId]/invite
 * 社員をカリキュラムに招待する(カリキュラム専用リンクと、各テストの受講枠を作る)。
 * body: { employeeIds: string[] }
 */
export async function POST(req: NextRequest, { params }: { params: { curriculumId: string } }) {
  const authResult = await requireAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const body = (await req.json().catch(() => ({}))) as { employeeIds?: string[] };
  const employeeIds = (body.employeeIds ?? []).filter((id) => typeof id === "string");
  if (employeeIds.length === 0) {
    return NextResponse.json({ error: "招待する社員を選んでください。" }, { status: 400 });
  }
  try {
    await inviteToCurriculum(params.curriculumId, employeeIds, authResult.email ?? "admin");
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof CurriculumError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "招待に失敗しました。" }, { status: 500 });
  }
}
