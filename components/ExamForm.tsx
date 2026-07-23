"use client";

import { useEffect, useRef, useState } from "react";
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
  const [pasteBlockedCount, setPasteBlockedCount] = useState(0);

  // 受験中にタブ・ウィンドウを離れた回数と合計時間を記録する
  // (検索行為そのものを禁止はできないが、レポートで採点者が判断できるようにする)
  const tabSwitchCountRef = useRef(0);
  const tabAwayMsRef = useRef(0);
  const hiddenAtRef = useRef<number | null>(null);

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.hidden) {
        hiddenAtRef.current = Date.now();
        tabSwitchCountRef.current += 1;
      } else if (hiddenAtRef.current !== null) {
        tabAwayMsRef.current += Date.now() - hiddenAtRef.current;
        hiddenAtRef.current = null;
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  function setAnswer(questionId: string, value: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  }

  function handleDescriptivePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    e.preventDefault();
    setPasteBlockedCount((c) => c + 1);
  }

  function handleQuestionCopy(e: React.ClipboardEvent<HTMLParagraphElement>) {
    e.preventDefault();
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      // 離れていた時点でまだ戻ってきていない場合も、現在時刻までを加算する
      if (hiddenAtRef.current !== null) {
        tabAwayMsRef.current += Date.now() - hiddenAtRef.current;
        hiddenAtRef.current = null;
      }
      const payload = {
        answers: questions.map((q) => ({
          questionId: q.id,
          answer: answers[q.id] ?? "",
        })),
        tabSwitchCount: tabSwitchCountRef.current,
        tabAwayMs: tabAwayMsRef.current,
        pasteBlockedCount,
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
          <p
            className="question-text"
            onCopy={handleQuestionCopy}
            style={{ userSelect: "none" }}
          >
            {q.question}
          </p>

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
              onPaste={handleDescriptivePaste}
              placeholder="回答を入力してください(貼り付けは無効です。ご自身の言葉でご記入ください)"
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