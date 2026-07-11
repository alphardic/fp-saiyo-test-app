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

  if (submitted) {
    return <p>回答を提出しました。ご協力ありがとうございました。</p>;
  }

  return (
    <div>
      {questions.map((q, idx) => (
        <div
          key={q.id}
          style={{
            marginBottom: 24,
            paddingBottom: 16,
            borderBottom: "1px solid #ddd",
          }}
        >
          <p style={{ fontWeight: "bold" }}>
            問{idx + 1}({q.field} / {q.type})
          </p>
          <p>{q.question}</p>

          {q.type === "選択式" && q.choices ? (
            <div>
              {q.choices.map((choice) => (
                <label key={choice} style={{ display: "block", margin: "4px 0" }}>
                  <input
                    type="radio"
                    name={q.id}
                    value={choice.slice(0, 1)}
                    checked={answers[q.id] === choice.slice(0, 1)}
                    onChange={(e) => setAnswer(q.id, e.target.value)}
                  />{" "}
                  {choice}
                </label>
              ))}
            </div>
          ) : (
            <textarea
              rows={5}
              style={{ width: "100%" }}
              value={answers[q.id] ?? ""}
              onChange={(e) => setAnswer(q.id, e.target.value)}
            />
          )}
        </div>
      ))}

      {error && <p style={{ color: "red" }}>{error}</p>}

      <button onClick={handleSubmit} disabled={submitting}>
        {submitting ? "提出中..." : "回答を提出する"}
      </button>
    </div>
  );
}
