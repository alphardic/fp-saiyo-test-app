import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/adminAuth";
import {
  AuthoringAIError,
  type CourseContext,
  type OutlinePoint,
  type QuestionDraft,
} from "@/lib/trainingAuthoringAI";

export const ALLOWED_EMAIL_DOMAINS = ["alpha-fp.com", "peoples-connect.com"];

export class AuthoringError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export type CourseStatus = "draft" | "pending" | "rejected" | "active" | "archived";

export interface AuthoringCourse {
  id: string;
  name: string;
  description: string | null;
  target_audience: string | null;
  source_notes: string;
  outline: OutlinePoint[];
  variants_per_point: number;
  status: CourseStatus;
  author_employee_id: string | null;
  review_comment: string | null;
  submitted_at: string | null;
  decided_at: string | null;
  decided_by: string | null;
  created_at: string;
}

export interface AuthoringQuestion extends QuestionDraft {
  id: string;
  group_key: string;
  group_label: string;
  sort_order: number;
}

const COURSE_COLUMNS =
  "id, name, description, target_audience, source_notes, outline, variants_per_point, status, author_employee_id, review_comment, submitted_at, decided_at, decided_by, created_at";

/**
 * 作問APIの操作者。社員は作問用リンクのトークン(x-author-token ヘッダー)、
 * 管理者は通常の管理画面ログイン(Authorization ヘッダー)で識別する。
 */
export type Actor =
  | { kind: "author"; employeeId: string; name: string; email: string | null }
  | { kind: "admin"; name: string };

export async function resolveActor(req: NextRequest): Promise<Actor> {
  const authorToken = req.headers.get("x-author-token");
  if (authorToken) {
    const supabase = getSupabaseServerClient();
    const { data: author } = await supabase
      .from("training_authors")
      .select("employee_id")
      .eq("author_token", authorToken)
      .maybeSingle();
    if (!author) throw new AuthoringError("無効な作問リンクです。", 404);
    const { data: employee } = await supabase
      .from("employees")
      .select("id, name, email")
      .eq("id", author.employee_id)
      .single();
    if (!employee) throw new AuthoringError("社員情報が見つかりません。", 404);
    return { kind: "author", employeeId: employee.id, name: employee.name, email: employee.email };
  }

  const adminResult = await requireAdmin(req);
  if (adminResult instanceof NextResponse) {
    throw new AuthoringError("ログインが必要です。", adminResult.status);
  }
  return { kind: "admin", name: adminResult.email ?? "管理者" };
}

/**
 * コースを読み込み、操作者に権限があるか確認する。
 * - 社員: 自分が作ったコースのみ。編集は下書き・差し戻し中のみ
 * - 管理者: すべて閲覧可。編集は承認済み以外(承認待ちの修正も可)
 */
export async function loadCourseForActor(
  actor: Actor,
  courseId: string,
  opts: { edit: boolean }
): Promise<AuthoringCourse> {
  const supabase = getSupabaseServerClient();
  const { data: course } = await supabase
    .from("training_courses")
    .select(COURSE_COLUMNS)
    .eq("id", courseId)
    .maybeSingle();
  if (!course) throw new AuthoringError("テストが見つかりません。", 404);

  const c = course as AuthoringCourse;
  if (actor.kind === "author" && c.author_employee_id !== actor.employeeId) {
    throw new AuthoringError("このテストを操作する権限がありません。", 403);
  }
  if (opts.edit) {
    const editable: CourseStatus[] =
      actor.kind === "admin" ? ["draft", "pending", "rejected"] : ["draft", "rejected"];
    if (!editable.includes(c.status)) {
      throw new AuthoringError(
        c.status === "pending"
          ? "承認申請中のため編集できません。"
          : "承認済みのテストは編集できません。",
        409
      );
    }
  }
  return c;
}

export async function loadQuestions(courseId: string): Promise<AuthoringQuestion[]> {
  const supabase = getSupabaseServerClient();
  const { data } = await supabase
    .from("training_questions")
    .select("id, group_key, group_label, sort_order, question, choices, answer, explanation, created_at")
    .eq("course_id", courseId)
    .eq("status", "active")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  return (data ?? []) as AuthoringQuestion[];
}

export async function loadActiveRules(): Promise<string[]> {
  const supabase = getSupabaseServerClient();
  const { data } = await supabase
    .from("training_authoring_rules")
    .select("rule")
    .eq("active", true)
    .order("created_at", { ascending: true });
  return (data ?? []).map((r) => r.rule as string);
}

/** 抽出された作問ルールを保存する。空文字なら何もしない。 */
export async function saveLesson(
  lesson: string,
  actor: Actor,
  courseId: string
): Promise<string | null> {
  if (!lesson) return null;
  const supabase = getSupabaseServerClient();
  const { data } = await supabase
    .from("training_authoring_rules")
    .insert({ rule: lesson, source: "feedback", created_by: actor.name, source_course_id: courseId })
    .select("id")
    .single();
  return (data?.id as string | undefined) ?? null;
}

export function toCourseContext(course: AuthoringCourse): CourseContext {
  return {
    name: course.name,
    description: course.description,
    targetAudience: course.target_audience,
    sourceNotes: course.source_notes,
  };
}

export function toDraft(q: AuthoringQuestion): QuestionDraft {
  return { question: q.question, choices: q.choices, answer: q.answer, explanation: q.explanation };
}

/** 空白・全角/半角の違いを無視して氏名を比較するための正規化 */
const normalizeName = (s: string) => s.replace(/[\s　]/g, "").toLowerCase();

/**
 * 自己登録時の既存社員との突き合わせ:
 *   1) メールアドレス完全一致 → その社員
 *   2) 氏名一致 → その社員。メール未登録なら今回の値で補完
 *   3) どちらも無ければ新規作成
 */
export async function findOrCreateEmployee(name: string, email: string): Promise<{ id: string }> {
  const supabase = getSupabaseServerClient();
  const { data: allEmployees } = await supabase.from("employees").select("id, name, email");

  const byEmail = (allEmployees ?? []).find((e) => (e.email ?? "").toLowerCase() === email);
  if (byEmail) return { id: byEmail.id };

  const nameMatches = (allEmployees ?? []).filter(
    (e) => normalizeName(e.name) === normalizeName(name)
  );
  const match = nameMatches.find((e) => !e.email) ?? nameMatches[0] ?? null;
  if (match) {
    if (!match.email) {
      await supabase.from("employees").update({ email }).eq("id", match.id);
    }
    return { id: match.id };
  }

  const { data: created, error } = await supabase
    .from("employees")
    .insert({ name, email, invited_by: "self-registration" })
    .select("id")
    .single();
  if (error || !created) {
    throw new AuthoringError("登録に失敗しました: " + (error?.message ?? ""), 500);
  }
  return created;
}

/** 作問APIの共通エラーハンドリング */
export async function handleAuthoring(fn: () => Promise<unknown>): Promise<NextResponse> {
  try {
    const result = await fn();
    return NextResponse.json(result ?? { ok: true });
  } catch (e) {
    if (e instanceof AuthoringError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    if (e instanceof AuthoringAIError) {
      return NextResponse.json({ error: e.message }, { status: 502 });
    }
    console.error("作問APIでエラーが発生しました:", e);
    const message = e instanceof Error ? e.message : "";
    return NextResponse.json(
      { error: "予期しないエラーが発生しました。" + (message ? `(${message.slice(0, 200)})` : "") },
      { status: 500 }
    );
  }
}
