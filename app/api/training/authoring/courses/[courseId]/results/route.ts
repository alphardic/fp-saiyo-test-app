import { NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  AuthoringError,
  handleAuthoring,
  loadCourseForActor,
  resolveActor,
} from "@/lib/trainingAuthoring";

/**
 * GET /api/training/authoring/courses/[courseId]/results
 * テストの受験結果(受験者ごとの点数と、1問ずつの回答)を返す。作成者と管理者のみ。
 */
export async function GET(req: NextRequest, { params }: { params: { courseId: string } }) {
  return handleAuthoring(async () => {
    const actor = await resolveActor(req);
    const course = await loadCourseForActor(actor, params.courseId, { edit: false });
    if (course.role === "reviewer") {
      throw new AuthoringError("受験結果を見られるのはテストの作成者のみです。", 403);
    }
    const supabase = getSupabaseServerClient();

    const { data: enrollments } = await supabase
      .from("training_enrollments")
      .select("id, employee_id, created_at")
      .eq("course_id", course.id)
      .order("created_at", { ascending: true });
    const enrollmentIds = (enrollments ?? []).map((e) => e.id);
    const employeeIds = (enrollments ?? []).map((e) => e.employee_id);

    const [{ data: employees }, { data: attempts }] = await Promise.all([
      employeeIds.length > 0
        ? supabase.from("employees").select("id, name, email").in("id", employeeIds)
        : Promise.resolve({ data: [] as { id: string; name: string; email: string | null }[] }),
      enrollmentIds.length > 0
        ? supabase
            .from("training_attempts")
            .select("id, enrollment_id, score, total, passed, submitted_at")
            .in("enrollment_id", enrollmentIds)
            .eq("status", "submitted")
            .order("submitted_at", { ascending: false })
        : Promise.resolve({
            data: [] as {
              id: string;
              enrollment_id: string;
              score: number | null;
              total: number | null;
              passed: boolean | null;
              submitted_at: string | null;
            }[],
          }),
    ]);

    const attemptIds = (attempts ?? []).map((a) => a.id);
    const { data: answers } =
      attemptIds.length > 0
        ? await supabase
            .from("training_answers")
            .select("attempt_id, question_id, employee_answer, is_correct")
            .in("attempt_id", attemptIds)
        : { data: [] as { attempt_id: string; question_id: string; employee_answer: string | null; is_correct: boolean | null }[] };

    const questionIds = Array.from(new Set((answers ?? []).map((a) => a.question_id)));
    const { data: questions } =
      questionIds.length > 0
        ? await supabase
            .from("training_questions")
            .select("id, group_key, group_label, sort_order, question, choices, answer")
            .in("id", questionIds)
        : {
            data: [] as {
              id: string;
              group_key: string;
              group_label: string;
              sort_order: number;
              question: string;
              choices: string[];
              answer: string;
            }[],
          };
    const questionMap = new Map((questions ?? []).map((q) => [q.id, q]));

    const takers = (enrollments ?? []).map((en) => {
      const emp = (employees ?? []).find((e) => e.id === en.employee_id);
      const myAttempts = (attempts ?? []).filter((a) => a.enrollment_id === en.id);
      return {
        employeeName: emp?.name ?? "(削除された社員)",
        employeeEmail: emp?.email ?? null,
        enrolledAt: en.created_at,
        attempts: myAttempts.map((a) => ({
          id: a.id,
          score: a.score,
          total: a.total,
          passed: a.passed,
          submittedAt: a.submitted_at,
          answers: (answers ?? [])
            .filter((x) => x.attempt_id === a.id)
            .map((x) => {
              const q = questionMap.get(x.question_id);
              return {
                questionId: x.question_id,
                groupLabel: q?.group_label ?? "",
                sortOrder: q?.sort_order ?? 0,
                question: q?.question ?? "(削除された問題)",
                choices: q?.choices ?? [],
                correctAnswer: q?.answer ?? "",
                answer: x.employee_answer,
                isCorrect: x.is_correct,
              };
            })
            .sort((p, q) => p.sortOrder - q.sortOrder),
        })),
      };
    });

    // 知識ポイントごとの正答率(各受験者の最新の受験で集計)
    const latest = takers.flatMap((t) => (t.attempts[0] ? [t.attempts[0]] : []));
    const pointStats = course.outline.map((p) => {
      const rows = latest.flatMap((a) =>
        a.answers.filter((x) => questionMap.get(x.questionId)?.group_key === p.key)
      );
      return {
        label: p.label,
        answered: rows.length,
        correct: rows.filter((r) => r.isCorrect).length,
      };
    });

    return { takers, pointStats };
  });
}
