import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { gradeDescriptiveAnswer } from "@/lib/aiGrading";
import { sendSubmissionNotification } from "@/lib/notify";

interface SubmitBody {
  answers: { questionId: string; answer: string }[];
}

/**
 * POST /api/exam/[token]/submit
 * 候補者の回答を保存する。
 * 選択式はここで自動採点。記述式はAnthropic APIで即時にAI採点する。
 * 記述式の採点が全て成功したらセッションを"graded"、
 * 一部でも失敗したら"submitted"のままにして、管理画面から再採点できるようにする。
 * 保存が成功した時点で、採用担当宛てに通知メールを送る。
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  const supabase = getSupabaseServerClient();
  const { token } = params;
  const body = (await req.json()) as SubmitBody;

  const { data: candidate } = await supabase
    .from("candidates")
    .select("id, name, email")
    .eq("invite_token", token)
    .single();

  if (!candidate) {
    return NextResponse.json(
      { error: "無効な受験リンクです。" },
      { status: 404 }
    );
  }

  const { data: session } = await supabase
    .from("exam_sessions")
    .select("id, status, question_ids")
    .eq("candidate_id", candidate.id)
    .single();

  if (!session) {
    return NextResponse.json(
      { error: "受験セッションが見つかりません。" },
      { status: 404 }
    );
  }
  if (session.status === "submitted" || session.status === "graded") {
    return NextResponse.json(
      { error: "既に提出済みです。" },
      { status: 409 }
    );
  }

  const { data: questions } = await supabase
    .from("questions")
    .select("id, type, question, answer, explanation")
    .in("id", session.question_ids);

  const questionMap = new Map((questions ?? []).map((q) => [q.id, q]));

  const rows = body.answers.map(({ questionId, answer }) => {
    const q = questionMap.get(questionId);
    const isSelectType = q?.type === "選択式";
    return {
      session_id: session.id,
      question_id: questionId,
      candidate_answer: answer,
      is_correct: isSelectType ? answer === q?.answer : null,
      ai_score: null as number | null,
      ai_grading_notes: null as string | null,
    };
  });

  const { error: insertError } = await supabase
    .from("answers")
    .upsert(rows, { onConflict: "session_id,question_id" });

  if (insertError) {
    return NextResponse.json(
      { error: "回答の保存に失敗しました。" },
      { status: 500 }
    );
  }

  await sendSubmissionNotification({
    candidateName: candidate.name,
    candidateEmail: candidate.email,
  });

  const descriptiveRows = rows.filter(
    (r) => questionMap.get(r.question_id)?.type === "記述式"
  );

  const results = await Promise.allSettled(
    descriptiveRows.map(async (row) => {
      const q = questionMap.get(row.question_id)!;
      const result = await gradeDescriptiveAnswer({
        question: q.question,
        modelAnswer: q.answer,
        gradingCriteria: q.explanation,
        candidateAnswer: row.candidate_answer ?? "",
      });
      const { error } = await supabase
        .from("answers")
        .update({ ai_score: result.score, ai_grading_notes: result.notes })
        .eq("session_id", session.id)
        .eq("question_id", row.question_id);
      if (error) throw error;
    })
  );

  const allGraded = results.every((r) => r.status === "fulfilled");

  // 失敗した採点の原因をログに残す(これが無いとCloudflareのReal-time logsに何も出ない)
  for (const r of results) {
    if (r.status === "rejected") {
      console.error("AI採点に失敗しました:", r.reason);
    }
  }

  await supabase
    .from("exam_sessions")
    .update({
      status: allGraded ? "graded" : "submitted",
      submitted_at: new Date().toISOString(),
    })
    .eq("id", session.id);

  return NextResponse.json({ ok: true });
}