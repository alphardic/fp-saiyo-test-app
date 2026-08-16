"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

interface Question {
  id: string;
  group_label: string;
  question: string;
  choices: string[];
}

interface StatusResponse {
  employeeName: string;
  courseName: string;
  courseDescription: string;
  passed: boolean;
  attemptCount: number;
  lastResult: { score: number; total: number; passed: boolean } | null;
  inProgressAttemptId: string | null;
  questions: Question[];
  totalQuestions: number;
  passThreshold: number;
}

interface SubmitResult {
  score: number;
  total: number;
  passed: boolean;
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
  const [result, setResult] = useState<SubmitResult | null>(null);

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
    setAnswers({});
    setQuestions(data.questions ?? []);
  }

  function setAnswer(questionId: string, value: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  }

  async function handleSubmit() {
    if (!questions) return;
    const unanswered = questions.filter((q) => !answers[q.id]);
    if (unanswered.length > 0) {
      if (!confirm(`未回答の設問が${unanswered.length}件あります。このまま提出しますか？`)) {
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
    setResult(data);
    setQuestions(null);
    await load();
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

        {questions.map((q, idx) => (
          <div key={q.id} className="question-card">
            <div className="question-meta">
              <span className="question-number">{idx + 1}</span>
              <span className="question-tag">{q.group_label}</span>
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
        ))}

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
        <button onClick={handleStart} disabled={starting} className="btn btn-primary btn-block">
          {starting ? "準備中..." : status.attemptCount > 0 ? "再受験する" : "テストを開始する"}
        </button>
      </div>

      {error && <div className="alert alert-error mt-24">{error}</div>}
    </main>
  );
}
