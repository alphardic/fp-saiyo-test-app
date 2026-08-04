"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { formatMbti } from "@/lib/mbti";
interface MainReportData {
  candidateName: string;
  candidateEmail: string;
  submittedAt: string | null;
  fieldScores: Record<string, number>;
  overallSummary: string | null;
}
interface LogicReportSummary {
  logic_score: number;
  hearing_score: number;
  self_persuasion_score: number;
  overall_summary: string;
}
function scoreColor(score: number) {
  if (score >= 70) return "var(--color-success)";
  if (score >= 40) return "var(--color-warning)";
  return "var(--color-error)";
}
function ScoreBar({ label, score }: { label: string; score: number }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
        <span>{label}</span>
        <span style={{ fontWeight: 600 }}>{score}点</span>
      </div>
      <div style={{ background: "#eef1f5", borderRadius: 999, height: 8, overflow: "hidden" }}>
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
}
export default function CombinedCandidateReportPage() {
  const params = useParams<{ id: string }>();
  const candidateId = params.id;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [candidateName, setCandidateName] = useState("");
  const [candidateEmail, setCandidateEmail] = useState("");
  const [mainStatus, setMainStatus] = useState("not_started");
  const [mainSessionId, setMainSessionId] = useState<string | null>(null);
  const [mainReport, setMainReport] = useState<MainReportData | null>(null);
  const [logicStatus, setLogicStatus] = useState("not_issued");
  const [logicSessionId, setLogicSessionId] = useState<string | null>(null);
  const [logicReport, setLogicReport] = useState<LogicReportSummary | null>(null);
  const [logicMbti, setLogicMbti] = useState<string | null>(null);
  useEffect(() => {
    if (candidateId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidateId]);
  async function authHeader() {
    const { data } = await supabaseBrowser.auth.getSession();
    return { Authorization: "Bearer " + (data.session?.access_token ?? "") };
  }
  async function load() {
    setLoading(true);
    setError(null);
    const headers = await authHeader();
    const dashRes = await fetch("/api/admin/dashboard", { headers });
    if (!dashRes.ok) {
      setError("データの取得に失敗しました。");
      setLoading(false);
      return;
    }
    const dash = await dashRes.json();
    const candidate = (dash.candidates ?? []).find(
      (c: { id: string; name: string; email: string }) => c.id === candidateId
    );
    if (!candidate) {
      setError("候補者が見つかりません。");
      setLoading(false);
      return;
    }
    setCandidateName(candidate.name);
    setCandidateEmail(candidate.email);
    const session = (dash.sessions ?? []).find(
      (s: { candidate_id: string }) => s.candidate_id === candidateId
    );
    const mStatus = session?.status ?? "not_started";
    setMainStatus(mStatus);
    if (session) setMainSessionId(session.id);
    const logicCandidate = (dash.logicCandidates ?? []).find(
      (lc: { main_candidate_id: string | null }) => lc.main_candidate_id === candidateId
    );
    let lStatus = "not_issued";
    let lSessionId: string | null = null;
    if (logicCandidate) {
      const ls = (dash.logicSessions ?? []).find(
        (s: { candidate_id: string }) => s.candidate_id === logicCandidate.id
      );
      lStatus = ls?.status ?? "not_started";
      if (ls) lSessionId = ls.id;
      setLogicMbti(logicCandidate.mbti ?? null);
    }
    setLogicStatus(lStatus);
    setLogicSessionId(lSessionId);
    const fetches: Promise<void>[] = [];
    if (session && mStatus === "graded") {
      fetches.push(
        fetch(`/api/admin/sessions/${session.id}/report`, { headers }).then(async (r) => {
          if (r.ok) setMainReport(await r.json());
        })
      );
    }
    if (lSessionId && lStatus === "completed") {
      fetches.push(
        fetch(`/api/logic-admin/report/${lSessionId}`, { headers }).then(async (r) => {
          if (r.ok) {
            const body = await r.json();
            setLogicReport(body.report ?? null);
          }
        })
      );
    }
    await Promise.all(fetches);
    setLoading(false);
  }
  if (loading) {
    return (
      <main className="page">
        <p className="text-muted">読み込み中...</p>
      </main>
    );
  }
  if (error) {
    return (
      <main className="page page-narrow">
        <div className="card">
          <div className="alert alert-error" style={{ marginBottom: 12 }}>
            {error}
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
        <h1 style={{ marginTop: 8 }}>{candidateName} さんの総合レポート</h1>
        <p>{candidateEmail}</p>
      </div>
      <div className="section">
        <div className="section-title">
          <span className="dot" />
          <h2>金融リテラシーチェックテスト</h2>
        </div>
        <div className="card">
          {mainStatus !== "graded" ? (
            <p className="text-muted" style={{ marginBottom: 0 }}>
              {mainStatus === "not_started" && "まだ受験されていません。"}
              {mainStatus === "in_progress" && "受験中です。"}
              {mainStatus === "submitted" && "提出済みですが、まだ採点されていません。"}
            </p>
          ) : mainReport ? (
            <>
              {mainReport.overallSummary && (
                <p style={{ whiteSpace: "pre-wrap", marginBottom: 20 }}>
                  {mainReport.overallSummary}
                </p>
              )}
              {Object.entries(mainReport.fieldScores).map(([field, score]) => (
                <ScoreBar key={field} label={field} score={score} />
              ))}
              {mainSessionId && (
                <a href={"/admin/report/" + mainSessionId} className="btn btn-outline btn-sm mt-24">
                  設問別の詳細を見る
                </a>
              )}
            </>
          ) : (
            <p className="text-muted" style={{ marginBottom: 0 }}>
              データを取得できませんでした。
            </p>
          )}
        </div>
      </div>
      <div className="section" style={{ marginBottom: 0 }}>
        <div className="section-title">
          <span className="dot" />
          <h2>ロジカルシンキング適性テスト</h2>
        </div>
        <div className="card">
          {logicStatus !== "completed" ? (
            <p className="text-muted" style={{ marginBottom: 0 }}>
              {logicStatus === "not_issued" && "招待がまだ発行されていません。"}
              {logicStatus === "not_started" && "まだ受験されていません。"}
              {logicStatus === "in_progress" && "受験中です。"}
            </p>
          ) : logicReport ? (
            <>
              {logicMbti && (
                <p style={{ fontSize: 13, marginBottom: 16 }}>
                  <span className="text-muted">MBTI: </span>
                  <span style={{ fontWeight: 600 }}>{formatMbti(logicMbti)}</span>
                </p>
              )}
              {logicReport.overall_summary && (
                <p style={{ whiteSpace: "pre-wrap", marginBottom: 20 }}>
                  {logicReport.overall_summary}
                </p>
              )}
              <ScoreBar label="論理的思考力" score={logicReport.logic_score} />
              <ScoreBar label="ヒヤリング力" score={logicReport.hearing_score} />
              <ScoreBar label="自己洗脳力" score={logicReport.self_persuasion_score} />
              {logicSessionId && (
                <a
                  href={"/admin/logic-test/report/" + logicSessionId}
                  className="btn btn-outline btn-sm mt-24"
                >
                  設問別の詳細を見る
                </a>
              )}
            </>
          ) : (
            <p className="text-muted" style={{ marginBottom: 0 }}>
              データを取得できませんでした。
            </p>
          )}
        </div>
      </div>
    </main>
  );
}