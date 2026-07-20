"use client";

import { useState } from "react";
import type { QuestionForCandidate } from "@/lib/types";

interface Props {
  token: string;
  sessionId: string;
  questions: QuestionForCandidate[];
}

export default function ExamForm({ token, questions }: Props) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setAnswer(questionId: string, value: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        answers: questions.map((q) => ({
          questionId: q.id,
          answer: answers[q.id] ?? "",
        })),
      };
      const res = await fetch(`/api/exam/${token}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "提出に失敗しました。");
      }
      setSubmitted(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "提出に失敗しました。");
    } finally {
      setSubmitting(false);
    }
  }

  const answeredCount = questions.filter((q) => (answers[q.id] ?? "").trim() !== "")
    .length;

  if (submitted) {
    return (
      <div className="alert alert-success" style={{ marginBottom: 0 }}>
        回答を提出しました。ご協力ありがとうございました。
      </div>
    );
  }

  return (
    <div>
      <div className="alert alert-info">
        回答済み: {answeredCount} / {questions.length} 問
      </div>

      {questions.map((q, idx) => (
        <div key={q.id} className="question-card">
          <div className="question-meta">
            <span className="question-number">{idx + 1}</span>
            <span className="question-tag">{q.field}</span>
            <span className="question-tag">{q.type}</span>
          </div>
          <p className="question-text">{q.question}</p>

          {q.type === "選択式" && q.choices ? (
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
          ) : (
            <textarea
              rows={5}
              value={answers[q.id] ?? ""}
              onChange={(e) => setAnswer(q.id, e.target.value)}
              placeholder="回答を入力してください"
            />
          )}
        </div>
      ))}

      {error && <div className="alert alert-error mt-24">{error}</div>}

      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="btn btn-gold btn-block mt-24"
      >
        {submitting ? "提出中..." : "回答を提出する"}
      </button>
    </div>
  );
}