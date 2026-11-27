import { NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { AuthoringError, handleAuthoring, loadCourseForActor, resolveActor } from "@/lib/trainingAuthoring";
import { generateVideoPackage } from "@/lib/trainingAuthoringAI";
import { requireVimeoUri, withVimeo } from "@/lib/trainingVideoAuthoring";
import { updateVideoText } from "@/lib/vimeoApi";

/**
 * POST /api/training/authoring/courses/[courseId]/video/ai-package
 * 資料ノート(PDF・原稿・字幕)から、AI がタイトル・説明文・受講対象者・サムネイルの文言を作る。
 * タイトルと説明文はテストと Vimeo の動画の両方に反映する。サムネイルの文言は画面に返し、画面で画像にする。
 */
export async function POST(req: NextRequest, { params }: { params: { courseId: string } }) {
  return handleAuthoring(async () => {
    const actor = await resolveActor(req);
    const course = await loadCourseForActor(actor, params.courseId, { edit: true });
    const uri = requireVimeoUri(course);
    if (!course.source_notes.trim()) {
      throw new AuthoringError("先に動画の内容(資料のPDF・原稿・字幕のどれか)を読み込んでください。", 400);
    }

    const pkg = await generateVideoPackage({
      fileName: course.name,
      sourceNotes: course.source_notes,
      currentTitle: course.name,
    });

    const supabase = getSupabaseServerClient();
    const { error } = await supabase
      .from("training_courses")
      .update({ name: pkg.title, description: pkg.description, target_audience: pkg.targetAudience })
      .eq("id", course.id);
    if (error) throw new AuthoringError("保存に失敗しました: " + error.message, 500);

    await withVimeo(() => updateVideoText(uri, pkg.title, pkg.description));
    return pkg;
  });
}

/**
 * PUT /api/training/authoring/courses/[courseId]/video/ai-package
 * 画面で手直ししたタイトル・説明文・受講対象者を、テストと Vimeo の動画の両方に反映する。
 * body: { title, description, targetAudience? }
 */
export async function PUT(req: NextRequest, { params }: { params: { courseId: string } }) {
  return handleAuthoring(async () => {
    const actor = await resolveActor(req);
    const course = await loadCourseForActor(actor, params.courseId, { edit: true });
    const uri = requireVimeoUri(course);
    const body = (await req.json().catch(() => ({}))) as {
      title?: string;
      description?: string;
      targetAudience?: string;
    };
    const title = body.title?.trim();
    if (!title) throw new AuthoringError("タイトルを入力してください。", 400);
    const description = body.description?.trim() ?? "";

    const supabase = getSupabaseServerClient();
    const { error } = await supabase
      .from("training_courses")
      .update({
        name: title,
        description: description || null,
        ...(body.targetAudience !== undefined ? { target_audience: body.targetAudience.trim() || null } : {}),
      })
      .eq("id", course.id);
    if (error) throw new AuthoringError("保存に失敗しました: " + error.message, 500);

    await withVimeo(() => updateVideoText(uri, title, description));
    return { ok: true };
  });
}
