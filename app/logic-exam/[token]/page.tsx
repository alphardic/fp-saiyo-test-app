"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { MBTI_TYPES, formatMbti } from "@/lib/mbti";

interface Choice {
  key: string;
  label: string;
}

interface Question {
  id: string;
  section: "A" | "B" | "C";
  type: "choice" | "text";
  sort_order: number;
  prompt: string;
  choices: Choice[] | null;
}

interface ExistingAnswer {
  question_id: string;
  choice_answer: string | null;
  text_answer: string | null;
}

const SECTION_LABEL: Record<string, string> = {
  A: "セクションA: 論理的推論",
  B: "セクションB: 顧客ヒヤリング・ケーススタディ",
  C: "セクションC: 自己洗脳力ライティング課題",
};

const SAVE_DEBOUNCE_MS = 800;

export default function LogicExamPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [candidateName, setCandidateName] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [mbti, setMbti] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [started, setStarted] = useState(false);

  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    if (!token) return;
    (async () => {
      setLoading(true);
      const res = await fetch(`/api/logic-exam/${token}`);
      const data = (await res.json()) as {
        error?: string;
        completed?: boolean;
        candidateName?: string;
        questions?: Question[];
        existingAnswers?: ExistingAnswer[];
      };
      if (!res.ok) {
        setError(data.error ?? "読み込みに失敗しました。");
        setLoading(false);
        return;
      }
      setCandidateName(data.candidateName ?? "");
      setQuestions(data.questions ?? []);
      const initial: Record<string, string> = {};
      let hasExisting = false;
      for (const a of data.existingAnswers ?? []) {
        const value = a.choice_answer ?? a.text_answer ?? "";
        if (value) hasExisting = true;
        initial[a.question_id] = value;
      }
      setAnswers(initial);
      // 既に回答途中のデータがある(=一度開始している)場合は、確認画面を飛ばして再開する
      if (hasExisting) setStarted(true);
      setLoading(false);
    })();
  }, [token]);

  function saveAnswer(questionId: string, question: Question, value: string) {
    fetch(`/api/logic-exam/${token}/save`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        questionId,
        choiceAnswer: question.type === "choice" ? value : undefined,
        textAnswer: question.type === "text" ? value : undefined,
      }),
    }).catch(() => {
      // 自動保存の失敗は画面をブロックしない(最終提出時に改めて保存されるため)
    });
  }

  function setAnswer(question: Question, value: string) {
    setAnswers((prev) => ({ ...prev, [question.id]: value }));

    if (question.type === "choice") {
      saveAnswer(question.id, question, value);
      return;
    }

    // 記述式は入力の都度ではなく、入力が落ち着いたタイミングでまとめて保存する
    const existingTimer = saveTimers.current[question.id];
    if (existingTimer) clearTimeout(existingTimer);
    saveTimers.current[question.id] = setTimeout(() => {
      saveAnswer(question.id, question, value);
    }, SAVE_DEBOUNCE_MS);
  }

  function flushPendingSaves() {
    for (const timer of Object.values(saveTimers.current)) {
      clearTimeout(timer);
    }
    saveTimers.current = {};
  }

  async function handleSubmit() {
    const unanswered = questions.filter((q) => !answers[q.id]?.trim());
    if (unanswered.length > 0) {
      if (!confirm(`未回答の設問が${unanswered.length}件あります。このまま提出しますか？`)) {
        return;
      }
    }

    flushPendingSaves();
    setSubmitting(true);
    setError(null);

    const payload = {
      mbti: mbti || undefined,
      answers: questions.map((q) => ({
        questionId: q.id,
        choiceAnswer: q.type === "choice" ? answers[q.id] : undefined,
        textAnswer: q.type === "text" ? answers[q.id] : undefined,
      })),
    };

    const res = await fetch(`/api/logic-exam/${token}/submit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    setSubmitting(false);

    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "提出に失敗しました。");
      return;
    }

    setSubmitted(true);
  }

  if (loading) {
    return (
      <main className="page page-narrow">
        <p className="text-muted">読み込み中...</p>
      </main>
    );
  }

  if (error && !submitted) {
    return (
      <main className="page page-narrow">
        <div className="alert alert-error">{error}</div>
      </main>
    );
  }

  if (submitted) {
    return (
      <main className="page page-narrow">
        <div className="card text-center">
          <h1>提出が完了しました</h1>
          <p>ご回答いただきありがとうございました。</p>
        </div>
      </main>
    );
  }

  if (!started) {
    const sectionCounts = questions.reduce<Record<string, number>>((acc, q) => {
      acc[q.section] = (acc[q.section] ?? 0) + 1;
      return acc;
    }, {});

    return (
      <main className="page page-narrow">
        <div className="page-header">
          <h1>ロジカルシンキング適性テスト</h1>
          <p>{candidateName} 様</p>
        </div>
        <div className="card">
          <p style={{ marginTop: 0 }}>
            全{questions.length}問(所要時間の目安: 20〜30分)にご回答いただきます。
          </p>
          <ul style={{ paddingLeft: 20, marginBottom: 16 }}>
            {(["A", "B", "C"] as const)
              .filter((s) => sectionCounts[s])
              .map((s) => (
                <li key={s} style={{ marginBottom: 4 }}>
                  {SECTION_LABEL[s]}({sectionCounts[s]}問)
                </li>
              ))}
          </ul>
          <div className="alert alert-info" style={{ marginBottom: 16 }}>
            ご回答は入力のたびに自動保存されます。途中でページを閉じても、同じリンクから続きを再開できます。
          </div>
          <button onClick={() => setStarted(true)} className="btn btn-primary btn-block">
            テストを開始する
          </button>
        </div>
      </main>
    );
  }

  let currentSection = "";

  return (
    <main className="page page-wide">
      <div className="page-header">
        <h1>ロジカルシンキング適性テスト</h1>
        <p>{candidateName} 様</p>
      </div>

      <div className="alert alert-info">
        ご回答は自動保存されます。全ての設問にご回答のうえ、ページ下部の「提出する」ボタンを押してください。記述式の設問は文章でご記入ください。
      </div>

      <div className="card">
        <div className="field">
          <label htmlFor="mbti-select">あなたのMBTIタイプ(任意)</label>
          <select id="mbti-select" value={mbti} onChange={(e) => setMbti(e.target.value)}>
            <option value="">分からない・選択しない</option>
            {MBTI_TYPES.map((code) => (
              <option key={code} value={code}>
                {formatMbti(code)}
              </option>
            ))}
          </select>
          <p className="text-muted" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
            分からない場合は未選択のままで構いません。後ほど分かり次第、採用担当にお伝えいただければ反映します。
          </p>
        </div>
      </div>

      {questions.map((q, idx) => {
        const showSectionHeader = q.section !== currentSection;
        currentSection = q.section;

        return (
          <div key={q.id}>
            {showSectionHeader && (
              <div className="section-title mt-24">
                <span className="dot" />
                <h2>{SECTION_LABEL[q.section]}</h2>
              </div>
            )}
            <div className="card">
              <div className="question-meta">
                <span className="question-number">{idx + 1}</span>
              </div>
              <div className="question-text">{q.prompt}</div>

              {q.type === "choice" && q.choices && (
                <div>
                  {q.choices.map((c) => (
                    <label
                      key={c.key}
                      className={`choice ${answers[q.id] === c.key ? "choice-selected" : ""}`}
                    >
                      <input
                        type="radio"
                        name={q.id}
                        checked={answers[q.id] === c.key}
                        onChange={() => setAnswer(q, c.key)}
                      />
                      <span>{c.label}</span>
                    </label>
                  ))}
                </div>
              )}

              {q.type === "text" && (
                <div>
                  <textarea
                    rows={6}
                    value={answers[q.id] ?? ""}
                    onChange={(e) => setAnswer(q, e.target.value)}
                    onBlur={(e) => saveAnswer(q.id, q, e.target.value)}
                    placeholder="ここに回答を入力してください"
                  />
                  <div
                    className="text-muted"
                    style={{ fontSize: 12, textAlign: "right", marginTop: 4 }}
                  >
                    {(answers[q.id] ?? "").length}文字
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {error && <div className="alert alert-error mt-24">{error}</div>}

      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="btn btn-primary btn-block mt-24"
      >
        {submitting ? "提出中..." : "提出する"}
      </button>
    </main>
  );
}
