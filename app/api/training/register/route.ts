import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { ALLOWED_EMAIL_DOMAINS, AuthoringError, findOrCreateEmployee } from "@/lib/trainingAuthoring";

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

  let employee: { id: string };
  try {
    employee = await findOrCreateEmployee(name, email);
  } catch (e) {
    const message = e instanceof AuthoringError ? e.message : "登録に失敗しました。";
    return NextResponse.json({ error: message }, { status: 500 });
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
