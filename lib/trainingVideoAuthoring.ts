import { AuthoringError, type CourseWithRole } from "@/lib/trainingAuthoring";
import { VimeoError } from "@/lib/vimeoApi";

/** アプリからアップロードした動画(vimeo_uri あり)のテストかを確かめる */
export function requireVimeoUri(course: CourseWithRole): string {
  if (!course.vimeo_uri) {
    throw new AuthoringError("このテストには、アプリからアップロードした動画がありません。", 400);
  }
  return course.vimeo_uri;
}

/** Vimeo のエラーを、画面に出せるエラーに変える */
export async function withVimeo<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof VimeoError) throw new AuthoringError(e.message, e.status);
    throw e;
  }
}
