"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/browser";

interface Choice {
  key: string;
  label: string;
}

interface Answer {
  question_id: string;
  choice_answer: string | null;
  text_answer: string | null;
  ai_score: number | null;
  ai_notes: string | null;
}

interface Item {
  id: string;
  section: "A" | "B" | "C";
  type: "choice" | "text";
  sort_order: number;
  prompt: string;
  choices: Choice[] | null;
  correct_choice: string | null;
  answer: Answer | null;
}

interface ReportData {
  candidate: { id: string; name: string; email: string } | null;
  session: { id: string; status: string; completed_at: string | null } | null;
  report: {
    logic_score: number;
    hearing_score: number;
    self_persuasion_score: number;
    overall_summary: string;
  } | null;
  items: Item[];
}

const SECTION_LABEL: Record<string, string> = {
  A: "セクションA: 論理的推論",
  B: "セクションB: 顧客ヒヤリング・ケーススタディ",
  C: "セクションC: 自己洗脳力ライティング課題",
};

export default function LogicTestReportPage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId;

  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    (async () => {
      setLoading(true);
      const { data: sessionData } = await supabaseBrowser.auth.getSession();
      const headers = { authorization: `Bearer ${sessionData.session?.access_token ?? ""}` };
      const res = await fetch(`/api/logic-admin/report/${sessionId}`, { headers });
      const json = (await res.json()) as ReportData & { error?: string };
      if (!res.ok) {
        setError((json as { error?: string }).error ?? "読み込みに失敗しました。");
        setLoading(false);
        return;
      }
      setData(json);
      setLoading(false);
    })();
  }, [sessionId]);

  if (loading) {
    return (
      <main className="page page-wide">
        <p className="text-muted">読み込み中...</p>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="page page-wide">
        <div className="alert alert-error">{error ?? "データが見つかりません。"}</div>
      </main>
    );
  }

  let currentSection = "";

  return (
    <main className="page page-wide">
      <div className="page-header">
        <h1>{data.candidate?.name} さんのレポート</h1>
        <p>
          {data.candidate?.email}　
          <Link href="/admin/logic-test">← 一覧に戻る</Link>
        </p>
      </div>

      {data.report && (
        <div className="section">
          <div className="section-title">
            <span className="dot" />
            <h2>総合スコア</h2>
          </div>
          <div className="card">
            <div className="form-row">
              <div className="field">
                <label>論理的思考力</label>
                <div style={{ fontSize: 24, fontWeight: 700 }}>{data.report.logic_score}点</div>
              </div>
              <div className="field">
                <label>ヒヤリング力</label>
                <div style={{ fontSize: 24, fontWeight: 700 }}>{data.report.hearing_score}点</div>
              </div>
              <div className="field">
                <label>自己洗脳力</label>
                <div style={{ fontSize: 24, fontWeight: 700 }}>
                  {data.report.self_persuasion_score}点
                </div>
              </div>
            </div>
            {data.report.overall_summary && (
              <p className="mt-24" style={{ whiteSpace: "pre-wrap" }}>
                {data.report.overall_summary}
              </p>
            )}
          </div>
        </div>
      )}

      <div className="section">
        <div className="section-title">
          <span className="dot" />
          <h2>回答詳細</h2>
        </div>

        {data.items.map((item) => {
          const showSectionHeader = item.section !== currentSection;
          currentSection = item.section;

          return (
            <div key={item.id}>
              {showSectionHeader && <h2 className="mt-24">{SECTION_LABEL[item.section]}</h2>}
              <div className="card">
                <div className="question-text">{item.prompt}</div>

                {item.type === "choice" ? (
                  <div>
                    {item.choices?.map((c) => {
                      const isSelected = item.answer?.choice_answer === c.key;
                      const isCorrect = item.correct_choice === c.key;
                      return (
                        <div
                          key={c.key}
                          className={`choice ${isSelected ? "choice-selected" : ""}`}
                        >
                          <span>
                            {c.label}
                            {isCorrect && " (正解)"}
                            {isSelected && " ← 回答"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div>
                    <p style={{ whiteSpace: "pre-wrap" }}>
                      {item.answer?.text_answer || "(未回答)"}
                    </p>
                    {item.answer?.ai_score !== null && item.answer?.ai_score !== undefined && (
                      <div className="alert alert-info">
                        AI採点: {item.answer.ai_score}点<br />
                        {item.answer.ai_notes}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}