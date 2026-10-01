import { NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  AuthoringError,
  handleAuthoring,
  loadCourseForActor,
  resolveActor,
} from "@/lib/trainingAuthoring";
import { extractSourceNotes } from "@/lib/trainingAuthoringAI";

const MAX_PDF_BYTES = 10 * 1024 * 1024;

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * POST /api/training/authoring/courses/[courseId]/source
 * PDF資料をAIに読ませて「要点ノート」を作り、テストの資料ノートの末尾に追記する。
 */
export async function POST(req: NextRequest, { params }: { params: { courseId: string } }) {
  return handleAuthoring(async () => {
    const actor = await resolveActor(req);
    const course = await loadCourseForActor(actor, params.courseId, { edit: true });

    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) {
      throw new AuthoringError("PDFファイルを選択してください。", 400);
    }
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      throw new AuthoringError("PDFファイルのみ読み込めます。", 400);
    }
    if (file.size > MAX_PDF_BYTES) {
      throw new AuthoringError("PDFは10MBまでです。ページを分けて読み込んでください。", 400);
    }

    const notes = await extractSourceNotes({
      fileName: file.name,
      pdfBase64: toBase64(await file.arrayBuffer()),
    });

    const merged = [course.source_notes.trim(), `## 資料: ${file.name}\n\n${notes}`]
      .filter(Boolean)
      .join("\n\n");

    const supabase = getSupabaseServerClient();
    const { error } = await supabase
      .from("training_courses")
      .update({ source_notes: merged })
      .eq("id", course.id);
    if (error) throw new AuthoringError("保存に失敗しました: " + error.message, 500);

    return { sourceNotes: merged };
  });
}
