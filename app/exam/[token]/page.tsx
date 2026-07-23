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
      <main className="page page-wide">
        <div className="page-header">
          <h1>FP業界 入社適性テスト</h1>
          <p>
            {candidateName} 様、受験を開始してください。全{questions.length}問です。
          </p>
        </div>
        <div className="alert alert-error" style={{ marginBottom: 16 }}>
          本テストはご自身の知識・経験に基づく判断力を測定するものです。検索エンジンや生成AI(ChatGPT等)、書籍・メモ等の参照はご遠慮ください。
        </div>
        <div className="card">
          <ExamForm
            token={params.token}
            sessionId={sessionId}
            questions={questions}
          />
        </div>
      </main>
    );
  } catch (e) {
    const message =
      e instanceof ExamAccessError ? e.message : "予期しないエラーが発生しました。";
    return (
      <main className="page page-narrow">
        <div className="card">
          <h1>受験できません</h1>
          <p className="text-muted" style={{ marginBottom: 0 }}>
            {message}
          </p>
        </div>
      </main>
    );
  }
}