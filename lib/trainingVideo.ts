import type { SupabaseClient } from "@supabase/supabase-js";
import { VIDEO_COMPLETE_RATIO } from "@/lib/vimeo";

/**
 * 社内テストの研修動画(コースに1本)と、社員ごとの視聴記録を扱う。
 *
 * supabase/training_video_migration.sql を実行する前は、video_url 列や
 * training_video_progress テーブルが無い。そのときは「動画なし」として扱い、
 * これまでどおり受験できるようにする(SQLの実行待ちで受験が止まらないように)。
 */

export interface VideoProgressRow {
  enrollment_id: string;
  video_url: string;
  duration_sec: number;
  watched_seconds: number[];
  watched_sec: number;
  completed_at: string | null;
}

export interface VideoStatus {
  url: string;
  durationSec: number;
  watchedSec: number;
  /** 0〜100。長さが分からないうちは0 */
  percent: number;
  completed: boolean;
}

/** コースの動画URL。列がまだ無い・未設定なら null */
export async function loadCourseVideoUrl(
  supabase: SupabaseClient,
  courseId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("training_courses")
    .select("video_url")
    .eq("id", courseId)
    .maybeSingle();
  if (error || !data) return null;
  return (data as { video_url: string | null }).video_url || null;
}

function toStatus(url: string, row: VideoProgressRow | null): VideoStatus {
  // 動画が差し替えられていたら、前の動画の記録は使わない
  const current = row && row.video_url === url ? row : null;
  const durationSec = current?.duration_sec ?? 0;
  const watchedSec = current?.watched_sec ?? 0;
  return {
    url,
    durationSec,
    watchedSec,
    percent: durationSec > 0 ? Math.min(100, Math.floor((watchedSec / durationSec) * 100)) : 0,
    completed: !!current?.completed_at,
  };
}

export async function loadVideoStatus(
  supabase: SupabaseClient,
  enrollmentId: string,
  url: string
): Promise<VideoStatus> {
  const { data } = await supabase
    .from("training_video_progress")
    .select("enrollment_id, video_url, duration_sec, watched_seconds, watched_sec, completed_at")
    .eq("enrollment_id", enrollmentId)
    .maybeSingle();
  return toStatus(url, (data as VideoProgressRow | null) ?? null);
}

/** 1回に受け取る秒数の上限(数分に1回は送る作りなので十分) */
const MAX_SECONDS_PER_REQUEST = 600;

/**
 * プレーヤーから届いた「再生した秒」を記録に足す。
 * 届いた秒は「何秒目を再生したか」の一覧で、画面側で早送り・巻き戻しの区間は除いてある。
 */
export async function recordVideoSeconds(
  supabase: SupabaseClient,
  enrollmentId: string,
  url: string,
  seconds: number[],
  durationInput: number
): Promise<VideoStatus> {
  const { data: existing, error: loadError } = await supabase
    .from("training_video_progress")
    .select("enrollment_id, video_url, duration_sec, watched_seconds, watched_sec, completed_at")
    .eq("enrollment_id", enrollmentId)
    .maybeSingle();
  if (loadError) throw new Error(loadError.message);

  const row = existing as VideoProgressRow | null;
  const sameVideo = row && row.video_url === url;

  const durationSec = Math.max(
    sameVideo ? row.duration_sec : 0,
    Number.isFinite(durationInput) ? Math.floor(durationInput) : 0
  );

  const merged = new Set<number>(sameVideo ? row.watched_seconds : []);
  for (const s of seconds.slice(0, MAX_SECONDS_PER_REQUEST)) {
    if (Number.isInteger(s) && s >= 0 && (durationSec === 0 || s <= durationSec)) merged.add(s);
  }
  const watchedSeconds = Array.from(merged).sort((a, b) => a - b);
  const watchedSec = watchedSeconds.length;

  const reached = durationSec > 0 && watchedSec >= Math.floor(durationSec * VIDEO_COMPLETE_RATIO);
  const completedAt = sameVideo && row.completed_at ? row.completed_at : reached ? new Date().toISOString() : null;

  const next: VideoProgressRow = {
    enrollment_id: enrollmentId,
    video_url: url,
    duration_sec: durationSec,
    watched_seconds: watchedSeconds,
    watched_sec: watchedSec,
    completed_at: completedAt,
  };

  const { error } = await supabase
    .from("training_video_progress")
    .upsert({ ...next, updated_at: new Date().toISOString() }, { onConflict: "enrollment_id" });
  if (error) throw new Error(error.message);

  return toStatus(url, next);
}

/** 管理画面用: 受講者ごとの視聴状況(enrollment_id → 状況) */
export async function loadVideoStatusesForEnrollments(
  supabase: SupabaseClient,
  enrollmentIds: string[]
): Promise<Record<string, Omit<VideoProgressRow, "watched_seconds">>> {
  if (enrollmentIds.length === 0) return {};
  const { data, error } = await supabase
    .from("training_video_progress")
    .select("enrollment_id, video_url, duration_sec, watched_sec, completed_at")
    .in("enrollment_id", enrollmentIds);
  if (error || !data) return {};
  return Object.fromEntries(data.map((r) => [r.enrollment_id, r]));
}
