import { NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { AuthoringError, handleAuthoring, loadCourseForActor, resolveActor } from "@/lib/trainingAuthoring";
import { requireVimeoUri, withVimeo } from "@/lib/trainingVideoAuthoring";
import { fetchTranscript } from "@/lib/vimeoApi";

/**
 * POST /api/training/authoring/courses/[courseId]/video/transcript
 * Vimeo の字幕(自動字幕を含む)を取り込み、資料ノートの末尾に追記する。
 */
export async function POST(req: NextRequest, { params }: { params: { courseId: string } }) {
  return handleAuthoring(async () => {
    const actor = await resolveActor(req);
    const course = await loadCourseForActor(actor, params.courseId, { edit: true });
    const uri = requireVimeoUri(course);
    const transcript = await withVimeo(() => fetchTranscript(uri));
    if (!transcript) {
      throw new AuthoringError(
        "Vimeo に字幕がまだありません。自動字幕は動画の変換が終わってから作られます(プランによっては作られません)。資料のPDFか原稿を使ってください。",
        404
      );
    }
    const merged = [course.source_notes.trim(), `## 動画の字幕\n\n${transcript}`].filter(Boolean).join("\n\n");
    const supabase = getSupabaseServerClient();
    const { error } = await supabase.from("training_courses").update({ source_notes: merged }).eq("id", course.id);
    if (error) throw new AuthoringError("保存に失敗しました: " + error.message, 500);
    return { sourceNotes: merged };
  });
}
