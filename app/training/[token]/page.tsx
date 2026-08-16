"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useParams } from "next/navigation";

interface Question {
  id: string;
  group_label: string;
  question: string;
  choices: string[];
}

interface ReviewItem {
  id: string;
  group_label: string;
  question: string;
  choices: string[];
  employeeAnswer: string | null;
  correctAnswer: string;
  isCorrect: boolean;
  explanation: string;
}

interface StatusResponse {
  employeeName: string;
  courseName: string;
  courseDescription: string;
  passed: boolean;
  attemptCount: number;
  lastResult: { id: string; score: number; total: number; passed: boolean } | null;
  inProgressAttemptId: string | null;
  questions: Question[];
  totalQuestions: number;
  passThreshold: number;
}

interface SubmitResult {
  attemptId: string;
  score: number;
  total: number;
  passed: boolean;
  items: ReviewItem[];
}

export default function TrainingExamPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ score: number; total: number; passed: boolean } | null>(
    null
  );
  const [review, setReview] = useState<ReviewItem[] | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    load();
  }, [token]);

  async function load() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/training/${token}`);
    const data = (await res.json()) as StatusResponse & { error?: string };
    if (!res.ok) {
      setError(data.error ?? "読み込みに失敗しました。");
      setLoading(false);
      return;
    }
    setStatus(data);
    if (data.inProgressAttemptId) {
      setQuestions(data.questions);
      setAnswers({});
    } else {
      setQuestions(null);
    }
    setLoading(false);
  }

  async function handleStart() {
    setStarting(true);
    setError(null);
    const res = await fetch(`/api/training/${token}/start`, { method: "POST" });
    const data = (await res.json()) as { questions?: Question[]; error?: string };
    setStarting(false);
    if (!res.ok) {
      setError(data.error ?? "開始に失敗しました。");
      return;
    }
    setResult(null);
    setReview(null);
    setAnswers({});
    setQuestions(data.questions ?? []);
  }

  function setAnswer(questionId: string, value: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  }

  async function handleSubmit() {
    if (!questions) return;
    const unansweredNumbers = questions
      .map((q, idx) => (answers[q.id] ? null : idx + 1))
      .filter((n): n is number => n !== null);
    if (unansweredNumbers.length > 0) {
      if (
        !confirm(
          `未回答の設問があります(問${unansweredNumbers.join("、")})。このまま提出しますか？`
        )
      ) {
        return;
      }
    }
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/training/${token}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        answers: questions.map((q) => ({ questionId: q.id, answer: answers[q.id] ?? "" })),
      }),
    });
    const data = (await res.json()) as SubmitResult & { error?: string };
    setSubmitting(false);
    if (!res.ok) {
      setError(data.error ?? "提出に失敗しました。");
      return;
    }
    setResult({ score: data.score, total: data.total, passed: data.passed });
    setReview(data.items ?? null);
    setQuestions(null);
    await load();
  }

  async function loadReview(attemptId: string) {
    setReviewLoading(true);
    setReviewError(null);
    const res = await fetch(`/api/training/${token}/review/${attemptId}`);
    const data = (await res.json()) as { items?: ReviewItem[]; error?: string };
    setReviewLoading(false);
    if (!res.ok) {
      setReviewError(data.error ?? "答え合わせの読み込みに失敗しました。");
      return;
    }
    setReview(data.items ?? []);
  }

  if (loading) {
    return (
      <main className="page page-narrow">
        <p className="text-muted">読み込み中...</p>
      </main>
    );
  }

  if (error && !status) {
    return (
      <main className="page page-narrow">
        <div className="alert alert-error">{error}</div>
      </main>
    );
  }

  if (!status) return null;

  const passPercent = Math.round((status.passThreshold / status.totalQuestions) * 100);

  function ReviewList({ items }: { items: ReviewItem[] }) {
    return (
      <div className="mt-24">
        <div className="section-title">
          <span className="dot" />
          <h2>答え合わせ</h2>
        </div>
        {items.map((item, idx) => (
          <div
            key={item.id}
            className="question-card"
            style={{
              borderColor: item.isCorrect ? "var(--color-success, #1a7f37)" : "var(--color-error)",
            }}
          >
            <div className="question-meta">
              <span className="question-number">{idx + 1}</span>
              <span className="question-tag">{item.group_label}</span>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: item.isCorrect ? "var(--color-success, #1a7f37)" : "var(--color-error)",
                }}
              >
                {item.isCorrect ? "○ 正解" : "× 不正解"}
              </span>
            </div>
            <p className="question-text">{item.question}</p>
            <div>
              {item.choices.map((choice) => {
                const letter = choice.slice(0, 1);
                const isYourAnswer = item.employeeAnswer === letter;
                const isCorrectAnswer = item.correctAnswer === letter;
                let style: CSSProperties = {};
                if (isCorrectAnswer) {
                  style = { borderColor: "var(--color-success, #1a7f37)", background: "#f0fdf4" };
                } else if (isYourAnswer && !isCorrectAnswer) {
                  style = { borderColor: "var(--color-error)", background: "#fef2f2" };
                }
                return (
                  <div key={choice} className="choice" style={style}>
                    <span>
                      {choice}
                      {isCorrectAnswer && (
                        <strong style={{ marginLeft: 8, color: "var(--color-success, #1a7f37)" }}>
                          ← 正解
                        </strong>
                      )}
                      {isYourAnswer && !isCorrectAnswer && (
                        <strong style={{ marginLeft: 8, color: "var(--color-error)" }}>
                          ← あなたの回答
                        </strong>
                      )}
                      {!item.employeeAnswer && isCorrectAnswer && (
                        <span style={{ marginLeft: 8 }} className="text-muted">
                          (未回答でした)
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="text-muted" style={{ marginTop: 10, marginBottom: 0, fontSize: 13 }}>
              解説: {item.explanation}
            </p>
          </div>
        ))}
      </div>
    );
  }

  // 受験中(進行中の受験がある)
  if (questions) {
    const answeredCount = questions.filter((q) => answers[q.id]).length;
    const threshold = Math.ceil(questions.length * (status.passThreshold / status.totalQuestions));
    return (
      <main className="page page-wide">
        <div className="page-header">
          <h1>{status.courseName}</h1>
          <p>
            {status.employeeName} 様、全{questions.length}問中{threshold}問(
            {Math.round((threshold / questions.length) * 100)}%)以上の正解で合格です。
          </p>
        </div>

        <div className="alert alert-info">
          回答済み: {answeredCount} / {questions.length} 問
        </div>

        {questions.map((q, idx) => {
          const isUnanswered = !answers[q.id];
          return (
            <div
              key={q.id}
              className="question-card"
              style={isUnanswered ? { borderColor: "var(--color-error)" } : undefined}
            >
              <div className="question-meta">
                <span className="question-number">{idx + 1}</span>
                <span className="question-tag">{q.group_label}</span>
                {isUnanswered && (
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-error)" }}>
                    未回答
                  </span>
                )}
              </div>
              <p className="question-text">{q.question}</p>
              <div>
                {q.choices.map((choice) => {
                  const value = choice.slice(0, 1);
                  const selected = answers[q.id] === value;
                  return (
                    <label
                      key={choice}
                      className={`choice${selected ? " choice-selected" : ""}`}
                    >
                      <input
                        type="radio"
                        name={q.id}
                        value={value}
                        checked={selected}
                        onChange={(e) => setAnswer(q.id, e.target.value)}
                      />
                      <span>{choice}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}

        {error && <div className="alert alert-error mt-24">{error}</div>}

        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="btn btn-gold btn-block mt-24"
        >
          {submitting ? "採点中..." : "回答を提出する"}
        </button>
      </main>
    );
  }

  // 受験結果・開始前の画面
  return (
    <main className="page page-narrow">
      <div className="page-header">
        <h1>{status.courseName}</h1>
        <p>{status.employeeName} 様</p>
      </div>

      {result && (
        <div className={`alert ${result.passed ? "alert-success" : "alert-error"}`}>
          {result.passed
            ? `合格です！(${result.score} / ${result.total}問正解)`
            : `不合格でした(${result.score} / ${result.total}問正解)。${status.passThreshold}問(${passPercent}%)以上の正解で合格となります。`}
        </div>
      )}

      {!result && status.passed && (
        <div className="alert alert-success">
          既に合格しています。({status.lastResult?.score} / {status.lastResult?.total}問正解)
        </div>
      )}

      {!result && !status.passed && status.attemptCount > 0 && (
        <div className="alert alert-error">
          前回は不合格でした。({status.lastResult?.score} / {status.lastResult?.total}問正解)
          {status.passThreshold}問({passPercent}%)以上正解するまで何度でも再受験できます。
        </div>
      )}

      {status.attemptCount === 0 && !status.passed && (
        <div className="card" style={{ marginBottom: 16, background: "#fff7ed", borderColor: "#fdba74" }}>
          <p style={{ fontWeight: 600, marginBottom: 4 }}>
            🏠 このテストに合格しないと、MUJIハウス経由のお客様を担当できません
          </p>
          <p className="text-muted" style={{ marginBottom: 0 }}>
            MUJIハウスとの提携は、紹介いただいたお客様に正しい知識と自信を持って対応できることが前提です。このテストに合格することが、MUJIハウスの現場デビューの第一歩になります。
          </p>
        </div>
      )}

      {status.courseDescription && (
        <div className="card" style={{ marginBottom: 16 }}>
          <p className="text-muted" style={{ marginBottom: 0 }}>{status.courseDescription}</p>
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <p style={{ fontWeight: 600, marginBottom: 12 }}>テストのルール</p>
        <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
          <li>出題数: {status.totalQuestions}問(4択形式)</li>
          <li>
            合格ライン: {status.passThreshold}問({passPercent}%)以上の正解
          </li>
          <li>所要時間の目安: 約15〜20分</li>
          <li>
            何度でも再受験できます。不合格の場合、次回受験時は設問の一部が別のパターンに入れ替わります(丸暗記対策)
          </li>
        </ul>
      </div>

      <div className="card text-center">
        <p className="text-muted">
          受験回数: {status.attemptCount}回
          {status.attemptCount > 0 && "(出題は毎回パターンが変わります)"}
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
          <button onClick={handleStart} disabled={starting} className="btn btn-primary">
            {starting ? "準備中..." : status.attemptCount > 0 ? "再受験する" : "テストを開始する"}
          </button>
          {status.lastResult && !review && (
            <button
              onClick={() => loadReview(status.lastResult!.id)}
              disabled={reviewLoading}
              className="btn btn-outline"
            >
              {reviewLoading ? "読み込み中..." : "前回の回答を確認する"}
            </button>
          )}
        </div>
      </div>

      {reviewError && <div className="alert alert-error mt-24">{reviewError}</div>}
      {error && <div className="alert alert-error mt-24">{error}</div>}

      {review && <ReviewList items={review} />}
    </main>
  );
}
