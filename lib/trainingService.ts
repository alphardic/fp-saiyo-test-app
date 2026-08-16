import { getSupabaseServerClient } from "@/lib/supabase/server";

export class TrainingAccessError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** 合格に必要な正答率。出題数に応じて合格ラインを動的に計算する(例: 20問なら16問以上)。 */
const PASS_RATIO = 0.8;

function passThresholdFor(total: number): number {
  return Math.ceil(total * PASS_RATIO);
}

interface AttemptRow {
  id: string;
  status: "in_progress" | "submitted";
  question_ids: string[];
  score: number | null;
  total: number | null;
  passed: boolean | null;
  started_at: string;
  submitted_at: string | null;
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * 知識ポイント(group_key)ごとに1パターンだけランダムに選び、出題順もシャッフルする。
 * カンニング対策として、再受験のたびに問題文・選択肢のパターンと順序が変わる。
 */
function pickOneVariantPerGroup(pool: { id: string; group_key: string }[]): string[] {
  const byGroup = new Map<string, string[]>();
  for (const q of pool) {
    const list = byGroup.get(q.group_key) ?? [];
    list.push(q.id);
    byGroup.set(q.group_key, list);
  }
  const selected: string[] = [];
  for (const ids of byGroup.values()) {
    selected.push(shuffle(ids)[0]);
  }
  return shuffle(selected);
}

async function loadEnrollment(token: string) {
  const supabase = getSupabaseServerClient();

  const { data: enrollment, error } = await supabase
    .from("training_enrollments")
    .select("id, course_id, employee_id")
    .eq("invite_token", token)
    .maybeSingle();

  if (error || !enrollment) {
    throw new TrainingAccessError("無効な受験リンクです。", 404);
  }

  const [{ data: employee }, { data: course }] = await Promise.all([
    supabase.from("employees").select("name").eq("id", enrollment.employee_id).single(),
    supabase
      .from("training_courses")
      .select("name, description")
      .eq("id", enrollment.course_id)
      .single(),
  ]);

  return { supabase, enrollment, employee, course };
}

/**
 * トークンから受講状況を取得する。
 * 進行中の受験があればその問題一覧を、なければ過去の受験結果一覧を返す。
 * app/api/training/[token]/route.ts から利用。
 */
export async function getTrainingStatusForToken(token: string) {
  const { supabase, enrollment, employee, course } = await loadEnrollment(token);

  const { data: attempts } = await supabase
    .from("training_attempts")
    .select("id, status, question_ids, score, total, passed, started_at, submitted_at")
    .eq("enrollment_id", enrollment.id)
    .order("started_at", { ascending: false });

  const attemptRows = (attempts ?? []) as AttemptRow[];
  const inProgress = attemptRows.find((a) => a.status === "in_progress") ?? null;
  const submittedAttempts = attemptRows.filter((a) => a.status === "submitted");
  const passed = submittedAttempts.some((a) => a.passed);

  const { data: pool } = await supabase
    .from("training_questions")
    .select("group_key")
    .eq("course_id", enrollment.course_id)
    .eq("status", "active");
  const totalQuestions = new Set((pool ?? []).map((q) => q.group_key)).size;

  let currentQuestions: {
    id: string;
    group_label: string;
    question: string;
    choices: string[];
  }[] = [];

  if (inProgress) {
    const { data: questions } = await supabase
      .from("training_questions")
      .select("id, group_label, question, choices")
      .in("id", inProgress.question_ids);

    const orderMap = new Map(inProgress.question_ids.map((id, idx) => [id, idx]));
    currentQuestions = (questions ?? []).sort(
      (a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0)
    );
  }

  return {
    employeeName: employee?.name ?? "",
    courseName: course?.name ?? "",
    courseDescription: course?.description ?? "",
    passed,
    attemptCount: submittedAttempts.length,
    lastResult: submittedAttempts[0] ?? null,
    inProgressAttemptId: inProgress?.id ?? null,
    questions: currentQuestions,
    totalQuestions,
    passThreshold: passThresholdFor(totalQuestions),
  };
}

/**
 * 新しい受験(挑戦)を開始する。進行中のものが既にあればそれを再利用する。
 * app/api/training/[token]/start/route.ts から利用。
 */
export async function startTrainingAttempt(token: string) {
  const { supabase, enrollment, employee, course } = await loadEnrollment(token);

  const { data: existing } = await supabase
    .from("training_attempts")
    .select("id, question_ids")
    .eq("enrollment_id", enrollment.id)
    .eq("status", "in_progress")
    .maybeSingle();

  let attemptId = existing?.id as string | undefined;
  let questionIds = existing?.question_ids as string[] | undefined;

  if (!attemptId) {
    const { data: pool } = await supabase
      .from("training_questions")
      .select("id, group_key")
      .eq("course_id", enrollment.course_id)
      .eq("status", "active");

    questionIds = pickOneVariantPerGroup(pool ?? []);

    const { data: created, error: createError } = await supabase
      .from("training_attempts")
      .insert({
        enrollment_id: enrollment.id,
        question_ids: questionIds,
        status: "in_progress",
      })
      .select("id")
      .single();

    if (createError || !created) {
      throw new TrainingAccessError("受験セッションの作成に失敗しました。", 500);
    }
    attemptId = created.id;
  }

  const { data: questions } = await supabase
    .from("training_questions")
    .select("id, group_label, question, choices")
    .in("id", questionIds ?? []);

  const orderMap = new Map((questionIds ?? []).map((id, idx) => [id, idx]));
  const orderedQuestions = (questions ?? []).sort(
    (a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0)
  );

  return {
    employeeName: employee?.name ?? "",
    courseName: course?.name ?? "",
    attemptId,
    questions: orderedQuestions,
  };
}

/**
 * 進行中の受験を採点・提出する。正答率がPASS_RATIO以上の場合に合格。
 * app/api/training/[token]/submit/route.ts から利用。
 */
export async function submitTrainingAttempt(
  token: string,
  answersInput: { questionId: string; answer: string }[]
) {
  const { supabase, enrollment } = await loadEnrollment(token);

  const { data: attempt, error: attemptError } = await supabase
    .from("training_attempts")
    .select("id, status, question_ids")
    .eq("enrollment_id", enrollment.id)
    .eq("status", "in_progress")
    .maybeSingle();

  if (attemptError || !attempt) {
    throw new TrainingAccessError("進行中の受験が見つかりません。", 404);
  }

  const { data: questions } = await supabase
    .from("training_questions")
    .select("id, answer")
    .in("id", attempt.question_ids);

  const answerMap = new Map(questions?.map((q) => [q.id, q.answer]) ?? []);
  const inputMap = new Map(answersInput.map((a) => [a.questionId, a.answer]));

  let correctCount = 0;
  const total = attempt.question_ids.length;

  const rows = attempt.question_ids.map((questionId: string) => {
    const employeeAnswer = inputMap.get(questionId) ?? null;
    const isCorrect = employeeAnswer !== null && employeeAnswer === answerMap.get(questionId);
    if (isCorrect) correctCount += 1;
    return {
      attempt_id: attempt.id,
      question_id: questionId,
      employee_answer: employeeAnswer,
      is_correct: isCorrect,
    };
  });

  if (rows.length > 0) {
    await supabase.from("training_answers").upsert(rows, { onConflict: "attempt_id,question_id" });
  }

  const passed = total > 0 && correctCount >= passThresholdFor(total);

  await supabase
    .from("training_attempts")
    .update({
      status: "submitted",
      score: correctCount,
      total,
      passed,
      submitted_at: new Date().toISOString(),
    })
    .eq("id", attempt.id);

  return { score: correctCount, total, passed };
}
