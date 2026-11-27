import { NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { AuthoringError, handleAuthoring, resolveActor } from "@/lib/trainingAuthoring";
import { withVimeo } from "@/lib/trainingVideoAuthoring";
import { createVideoUpload } from "@/lib/vimeoApi";
import { toVimeoPlayerUrl } from "@/lib/vimeo";

/** 研修動画として受け付ける最大サイズ(5GB) */
const MAX_VIDEO_BYTES = 5 * 1024 * 1024 * 1024;

/**
 * POST /api/training/authoring/video-uploads
 * 研修動画のアップロードを始める。Vimeo にアップロード枠を作り、その動画を付けた
 * 下書きのテストを作る。動画ファイル本体は、返した uploadLink にブラウザから直接送る。
 * body: { fileName: string, size: number }
 */
export async function POST(req: NextRequest) {
  return handleAuthoring(async () => {
    const actor = await resolveActor(req);
    if (actor.kind !== "author") {
      throw new AuthoringError("社員用ページからログインしてください。", 400);
    }
    const body = (await req.json().catch(() => ({}))) as { fileName?: string; size?: number };
    const fileName = body.fileName?.trim();
    const size = Number(body.size);
    if (!fileName) throw new AuthoringError("動画ファイルを選択してください。", 400);
    if (!Number.isFinite(size) || size <= 0) throw new AuthoringError("動画ファイルのサイズが読み取れません。", 400);
    if (size > MAX_VIDEO_BYTES) throw new AuthoringError("動画は5GBまでです。", 400);

    const title = fileName.replace(/\.[^.]+$/, "");
    const upload = await withVimeo(() =>
      createVideoUpload({ name: title, size, embedDomain: req.nextUrl.hostname })
    );

    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("training_courses")
      .insert({
        name: title,
        status: "draft",
        author_employee_id: actor.employeeId,
        video_url: toVimeoPlayerUrl(upload.link),
        vimeo_uri: upload.uri,
      })
      .select("id")
      .single();
    if (error || !data) {
      const missing = error?.message.includes("vimeo_uri") || error?.message.includes("video_url");
      throw new AuthoringError(
        missing
          ? "動画を保存する準備がまだです。管理者に supabase/training_curriculum_migration.sql の実行を依頼してください。"
          : "テストの作成に失敗しました: " + (error?.message ?? ""),
        500
      );
    }
    return { courseId: data.id as string, uploadLink: upload.uploadLink, vimeoLink: upload.link };
  });
}
