import { getExamForToken, ExamAccessError } from "@/lib/examService";
import ExamForm from "@/components/ExamForm";

export default async function ExamPage({
  params,
}: {
  params: { token: string };
}) {
  try {
    const { candidateName, sessionId, questions } = await getExamForToken(
      params.token
    );

    return (
      <main style={{ padding: 24, maxWidth: 800, margin: "0 auto" }}>
        <h1>FP業界 入社適性テスト</h1>
        <p>
          {candidateName} 様、受験を開始してください。全{questions.length}問です。
        </p>
        <ExamForm
          token={params.token}
          sessionId={sessionId}
          questions={questions}
        />
      </main>
    );
  } catch (e) {
    const message =
      e instanceof ExamAccessError ? e.message : "予期しないエラーが発生しました。";
    return (
      <main style={{ padding: 24, maxWidth: 640, margin: "0 auto" }}>
        <h1>受験できません</h1>
        <p>{message}</p>
      </main>
    );
  }
}