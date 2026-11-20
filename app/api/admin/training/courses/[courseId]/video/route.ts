import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/adminAuth";
import { toVimeoPlayerUrl } from "@/lib/vimeo";

/**
 * PUT /api/admin/training/courses/[courseId]/video
 * 社内テストに研修動画(Vimeo)を設定する。配布中のテストにも設定できる。
 * body: { videoUrl: "https://vimeo.com/..." | null }(null で動画なし)
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: { courseId: string } }
) {
  const authResult = await requireAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const body = (await req.json().catch(() => ({}))) as { videoUrl?: string | null };
  const raw = body.videoUrl?.trim() || null;
  const videoUrl = raw ? toVimeoPlayerUrl(raw) : null;
  if (raw && !videoUrl) {
    return NextResponse.json(
      { error: "VimeoのURLとして読み取れませんでした。動画ページのURL(https://vimeo.com/...)を貼ってください。" },
      { status: 400 }
    );
  }

  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from("training_courses")
    .update({ video_url: videoUrl })
    .eq("id", params.courseId);

  if (error) {
    const missingColumn = error.message.includes("video_url");
    return NextResponse.json(
      {
        error: missingColumn
          ? "動画を保存する準備がまだです。supabase/training_video_migration.sql を SQL Editor で実行してください。"
          : "動画の保存に失敗しました: " + error.message,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, videoUrl });
}
