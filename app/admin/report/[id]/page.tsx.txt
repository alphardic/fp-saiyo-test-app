"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";

const FIELDS = [
  "為替市場",
  "金利市場",
  "株式投資",
  "投資信託",
  "債券",
  "iDeCo",
  "NISA",
  "居住用不動産",
  "投資用不動産",
  "個人の税金",
  "保険",
  "家計管理",
  "ライフプラン",
];

interface QuestionBreakdown {
  field: string;
  type: string;
  question: string;
  candidateAnswer: string | null;
  isCorrect: boolean | null;
  aiScore: number | null;
  aiNotes: string | null;
}

interface ReportData {
  candidateName: string;
  candidateEmail: string;
  submittedAt: string | null;
  fieldScores: Record<string, number>;
  overallSummary: string | null;
  questionBreakdown: QuestionBreakdown[];
}

function scoreColor(score: number) {
  if (score >= 70) return "var(--color-success)";
  if (score >= 40) return "var(--color-warning)";
  return "var(--color-error)";
}

export default function ReportPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function getAccessToken(): Promise<string | null> {
    const { data } = await supabaseBrowser.auth.getSession();
    return data.session?.access_token ?? null;
  }

  async function load(regenerate = false) {
    if (regenerate) setRegenerating(true);
    else setLoading(true);
    setError(null);

    const token = await getAccessToken();
    if (!token) {
      setError("ログインが必要です。");
      setLoading(false);
      setRegenerating(false);
      return;
    }

    const res = await fetch(
      `/api/admin/sessions/${params.id}/report${regenerate ? "?regenerate=1" : ""}`,
      { headers: { Authorization: "Bearer " + token } }
    );

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "レポートの取得に失敗しました。");
      setLoading(false);
      setRegenerating(false);
      return;
    }

    const body = (await res.json()) as ReportData;
    setData(body);
    setLoading(false);
    setRegenerating(false);
  }

  if (loading) {
    return (
      <main className="page">
        <p className="text-muted">読み込み中...</p>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="page page-narrow">
        <div className="card">
          <div className="alert alert-error" style={{ marginBottom: 12 }}>
            {error ?? "データが見つかりません。"}
          </div>
          <a href="/admin" className="btn btn-outline">
            ダッシュボードへ戻る
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="page page-wide">
      <div className="page-header">
        <a href="/admin" className="text-muted" style={{ fontSize: 13 }}>
          ← ダッシュボードへ戻る
        </a>
        <h1 style={{ marginTop: 8 }}>{data.candidateName} 様のレポート</h1>
        <p>
          {data.candidateEmail} ・ 提出日時: {data.submittedAt ?? "-"}
        </p>
      </div>

      <div className="section">
        <div className="section-title">
          <span className="dot" />
          <h2>総評</h2>
        </div>
        <div className="card">
          {data.overallSummary ? (
            <p style={{ marginBottom: 0, whiteSpace: "pre-wrap" }}>
              {data.overallSummary}
            </p>
          ) : (
            <p className="text-muted" style={{ marginBottom: 0 }}>
              総評はまだ生成されていません。
            </p>
          )}
          <button
            onClick={() => load(true)}
            disabled={regenerating}
            className="btn btn-outline btn-sm mt-24"
          >
            {regenerating ? "再生成中..." : "総評を再生成する"}
          </button>
        </div>
      </div>

      <div className="section">
        <div className="section-title">
          <span className="dot" />
          <h2>分野別スコア</h2>
        </div>
        <div className="card">
          {FIELDS.map((field) => {
            const score = data.fieldScores[field] ?? 0;
            return (
              <div key={field} style={{ marginBottom: 14 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 13,
                    marginBottom: 4,
                  }}
                >
                  <span>{field}</span>
                  <span style={{ fontWeight: 600 }}>{score}点</span>
                </div>
                <div
                  style={{
                    background: "#eef1f5",
                    borderRadius: 999,
                    height: 8,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${score}%`,
                      height: "100%",
                      background: scoreColor(score),
                      borderRadius: 999,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="section" style={{ marginBottom: 0 }}>
        <div className="section-title">
          <span className="dot" />
          <h2>設問別回答</h2>
        </div>
        <div className="card">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>分野</th>
                  <th>種別</th>
                  <th>設問</th>
                  <th>回答</th>
                  <th>結果</th>
                </tr>
              </thead>
              <tbody>
                {data.questionBreakdown.map((q, idx) => (
                  <tr key={idx}>
                    <td className="text-muted">{q.field}</td>
                    <td className="text-muted">{q.type}</td>
                    <td style={{ maxWidth: 280 }}>{q.question}</td>
                    <td style={{ maxWidth: 200 }}>
                      {q.candidateAnswer || "(未回答)"}
                    </td>
                    <td>
                      {q.type === "選択式" ? (
                        <span
                          className={
                            q.isCorrect ? "badge badge-done" : "badge badge-muted"
                          }
                        >
                          {q.isCorrect ? "正解" : "不正解"}
                        </span>
                      ) : (
                        <span title={q.aiNotes ?? ""}>
                          {q.aiScore !== null ? `${q.aiScore}点` : "未採点"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}