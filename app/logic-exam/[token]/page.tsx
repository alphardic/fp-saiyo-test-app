"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

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

const MBTI_TYPES = [
  "INTJ",
  "INTP",
  "ENTJ",
  "ENTP",
  "INFJ",
  "INFP",
  "ENFJ",
  "ENFP",
  "ISTJ",
  "ISFJ",
  "ESTJ",
  "ESFJ",
  "ISTP",
  "ISFP",
  "ESTP",
  "ESFP",
];

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
      for (const a of data.existingAnswers ?? []) {
        initial[a.question_id] = a.choice_answer ?? a.text_answer ?? "";
      }
      setAnswers(initial);
      setLoading(false);
    })();
  }, [token]);

  function setAnswer(questionId: string, value: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  }

  async function handleSubmit() {
    if (!mbti) {
      setError("MBTIタイプを選択してください。");
      return;
    }

    const unanswered = questions.filter((q) => !answers[q.id]?.trim());
    if (unanswered.length > 0) {
      if (!confirm(`未回答の設問が${unanswered.length}件あります。このまま提出しますか？`)) {
        return;
      }
    }

    setSubmitting(true);
    setError(null);

    const payload = {
      mbti,
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

  let currentSection = "";

  return (
    <main className="page page-wide">
      <div className="page-header">
        <h1>ロジカルシンキング適性テスト</h1>
        <p>{candidateName} 様</p>
      </div>

      <div className="alert alert-info">
        全ての設問にご回答のうえ、ページ下部の「提出する」ボタンを押してください。記述式の設問は文章でご記入ください。
      </div>

      <div className="card">
        <div className="field">
          <label htmlFor="mbti-select">あなたのMBTIタイプを選択してください</label>
          <select id="mbti-select" value={mbti} onChange={(e) => setMbti(e.target.value)}>
            <option value="">選択してください</option>
            {MBTI_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      {questions.map((q) => {
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
                        onChange={() => setAnswer(q.id, c.key)}
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
                    onChange={(e) => setAnswer(q.id, e.target.value)}
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