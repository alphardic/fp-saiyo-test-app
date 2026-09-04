import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const ALLOWED_EMAIL_DOMAINS = ["alpha-fp.com", "peoples-connect.com"];

/**
 * POST /api/training/register
 * 分野別社内テストの自己登録。管理者が招待を発行しなくても、
 * 対象ドメインのメールアドレスを持つ社員が自分で受験を開始できる。
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    courseId?: string;
    name?: string;
    email?: string;
  };

  const courseId = body.courseId?.trim();
  const name = body.name?.trim();
  const email = body.email?.trim().toLowerCase();

  if (!courseId || !name || !email) {
    return NextResponse.json({ error: "氏名とメールアドレスを入力してください。" }, { status: 400 });
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(email)) {
    return NextResponse.json({ error: "メールアドレスの形式が正しくありません。" }, { status: 400 });
  }

  const isAllowedDomain = ALLOWED_EMAIL_DOMAINS.some((domain) => email.endsWith("@" + domain));
  if (!isAllowedDomain) {
    return NextResponse.json(
      {
        error: `${ALLOWED_EMAIL_DOMAINS.map((d) => "@" + d).join(" または ")} のメールアドレスのみ登録できます。`,
      },
      { status: 403 }
    );
  }

  const supabase = getSupabaseServerClient();

  const { data: course, error: courseError } = await supabase
    .from("training_courses")
    .select("id")
    .eq("id", courseId)
    .eq("status", "active")
    .maybeSingle();

  if (courseError || !course) {
    return NextResponse.json({ error: "無効なコースです。" }, { status: 404 });
  }

  // 既存社員との突き合わせ:
  //   1) メールアドレス完全一致 → その社員
  //   2) 氏名一致(空白・全角/半角の違いは無視) → その社員。メール未登録なら今回の値で補完
  //   3) どちらも無ければ新規作成
  // 管理者が一括登録した社員(メール未登録)に対して、本人の自己登録が
  // 重複レコードを作らないようにするための処理。
  const normalizeName = (s: string) => s.replace(/[\s　]/g, "").toLowerCase();

  const { data: allEmployees } = await supabase
    .from("employees")
    .select("id, name, email");

  let employee: { id: string } | null =
    (allEmployees ?? []).find((e) => (e.email ?? "").toLowerCase() === email) ?? null;

  if (!employee) {
    const nameMatches = (allEmployees ?? []).filter(
      (e) => normalizeName(e.name) === normalizeName(name)
    );
    // メール未登録のレコード(一括登録された社員)を優先して紐付ける
    const match = nameMatches.find((e) => !e.email) ?? nameMatches[0] ?? null;
    if (match) {
      employee = { id: match.id };
      if (!match.email) {
        await supabase.from("employees").update({ email }).eq("id", match.id);
      }
    }
  }

  if (!employee) {
    const { data: createdEmployee, error: createEmployeeError } = await supabase
      .from("employees")
      .insert({ name, email, invited_by: "self-registration" })
      .select("id")
      .single();

    if (createEmployeeError || !createdEmployee) {
      return NextResponse.json(
        { error: "登録に失敗しました: " + (createEmployeeError?.message ?? "") },
        { status: 500 }
      );
    }
    employee = createdEmployee;
  }

  const { data: existingEnrollment } = await supabase
    .from("training_enrollments")
    .select("invite_token")
    .eq("course_id", courseId)
    .eq("employee_id", employee.id)
    .maybeSingle();

  if (existingEnrollment) {
    return NextResponse.json({ inviteToken: existingEnrollment.invite_token });
  }

  const { data: createdEnrollment, error: createEnrollmentError } = await supabase
    .from("training_enrollments")
    .insert({
      course_id: courseId,
      employee_id: employee.id,
      invited_by: "self-registration",
    })
    .select("invite_token")
    .single();

  if (createEnrollmentError || !createdEnrollment) {
    return NextResponse.json(
      { error: "登録に失敗しました: " + (createEnrollmentError?.message ?? "") },
      { status: 500 }
    );
  }

  return NextResponse.json({ inviteToken: createdEnrollment.invite_token });
}
