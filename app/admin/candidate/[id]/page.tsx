"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { formatMbti } from "@/lib/mbti";
import { getKyuseiKigaku, getRokuseiSenjutsu } from "@/lib/fortune";
import { computeCompatibility, CompatibilityProfile } from "@/lib/compatibility";
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
interface CompatibilityEntry {
  type: string;
  reason: string;
}
interface RoleFitEntry {
  role: string;
  stars: number;
  reason: string;
}
interface Rokusei {
  star: string;
  sign: "+" | "-";
  label: string;
  reigou: boolean;
}
interface ComprehensiveReport {
  mbtiPersonality: string;
  fortunePersonality: string;
  overallSummary: string;
  howToHandle: string;
  goodCompatibility: CompatibilityEntry[];
  badCompatibility: CompatibilityEntry[];
  suitableRoles: RoleFitEntry[];
}
interface EmployeeRow {
  id: string;
  name: string;
  department: string | null;
  birthdate: string | null;
  mbti: string | null;
}
function scoreColor(score: number) {
  if (score >= 70) return "var(--color-success)";
  if (score >= 40) return "var(--color-warning)";
  return "var(--color-error)";
}
function compatScoreColor(score: number) {
  if (score >= 80) return "#2f9e44";
  if (score >= 70) return "#74b816";
  return "#adb5bd";
}
function compatScoreLabel(score: number) {
  if (score >= 80) return "とても良い";
  if (score >= 70) return "良い";
  return "普通";
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
function StarRating({ stars }: { stars: number }) {
  return (
    <span style={{ color: "#c9a24b", letterSpacing: 1 }}>
      {"★".repeat(stars)}
      <span style={{ color: "#dcdfe4" }}>{"★".repeat(5 - stars)}</span>
    </span>
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

  const [compLoading, setCompLoading] = useState(true);
  const [compError, setCompError] = useState<string | null>(null);
  const [compReport, setCompReport] = useState<ComprehensiveReport | null>(null);
  const [candidateKyusei, setCandidateKyusei] = useState<string | null>(null);
  const [candidateRokusei, setCandidateRokusei] = useState<Rokusei | null>(null);

  const [employeeScores, setEmployeeScores] = useState<
    { id: string; name: string; department: string | null; score: number }[]
  >([]);

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
    let mainOverall: string | null = null;
    let logicOverall: string | null = null;
    const fetches: Promise<void>[] = [];
    if (session && mStatus === "graded") {
      fetches.push(
        fetch(`/api/admin/sessions/${session.id}/report`, { headers }).then(async (r) => {
          if (r.ok) {
            const body = (await r.json()) as MainReportData;
            setMainReport(body);
            mainOverall = body.overallSummary;
          }
        })
      );
    }
    if (lSessionId && lStatus === "completed") {
      fetches.push(
        fetch(`/api/logic-admin/report/${lSessionId}`, { headers }).then(async (r) => {
          if (r.ok) {
            const body = await r.json();
            setLogicReport(body.report ?? null);
            logicOverall = body.report?.overall_summary ?? null;
          }
        })
      );
    }
    await Promise.all(fetches);
    setLoading(false);

    const testSummaryParts = [mainOverall, logicOverall].filter(Boolean);
    const testSummary = testSummaryParts.length > 0 ? testSummaryParts.join("\n") : null;
    await loadComprehensiveReport(headers, testSummary);
  }

  async function loadComprehensiveReport(
    headers: { Authorization: string },
    testSummary: string | null
  ) {
    setCompLoading(true);
    setCompError(null);
    try {
      const res = await fetch(`/api/admin/candidates/${candidateId}/comprehensive-report`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ testSummary }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "総合レポートの取得に失敗しました。");
      }
      setCompReport(json.report);
      setCandidateKyusei(json.kyuseiStar);
      setCandidateRokusei(json.rokusei);
      await loadEmployeeCompatibility(headers, {
        mbti: json.mbti,
        kyuseiStar: json.kyuseiStar,
        rokusei: json.rokusei,
      });
    } catch (e) {
      setCompError(e instanceof Error ? e.message : "エラーが発生しました。");
    } finally {
      setCompLoading(false);
    }
  }

  async function loadEmployeeCompatibility(
    headers: { Authorization: string },
    candidateProfile: CompatibilityProfile
  ) {
    try {
      const res = await fetch("/api/admin/employees", { headers });
      if (!res.ok) return;
      const json = await res.json();
      const employees: EmployeeRow[] = json.employees ?? [];
      const scores: { id: string; name: string; department: string | null; score: number }[] = [];
      for (const e of employees) {
        if (!e.mbti || !e.birthdate) continue;
        const birthdate = new Date(e.birthdate);
        const kyuseiStar = getKyuseiKigaku(birthdate);
        const rokusei = getRokuseiSenjutsu(birthdate);
        if (!kyuseiStar || !rokusei) continue;
        const empProfile: CompatibilityProfile = { mbti: e.mbti, kyuseiStar, rokusei };
        const result = computeCompatibility(candidateProfile, empProfile);
        scores.push({ id: e.id, name: e.name, department: e.department, score: result.overall });
      }
      scores.sort((a, b) => b.score - a.score);
      setEmployeeScores(scores);
    } catch {
      // 相性一覧の取得に失敗しても、他のレポート表示は継続する
    }
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
      <div className="section">
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

      <div className="section" style={{ marginBottom: 0 }}>
        <div className="section-title">
          <span className="dot" />
          <h2>MBTI・占いからみる総合レポート</h2>
        </div>

        {compLoading && (
          <div className="card">
            <p className="text-muted" style={{ marginBottom: 0 }}>
              生成しています...
            </p>
          </div>
        )}

        {!compLoading && compError && (
          <div className="card">
            <div className="alert alert-error" style={{ marginBottom: 0 }}>
              {compError}
            </div>
          </div>
        )}

        {!compLoading && !compError && compReport && (
          <>
            <div className="card" style={{ marginBottom: 16 }}>
              <p className="text-muted" style={{ marginBottom: 12 }}>
                MBTI: {formatMbti(logicMbti)} ・ 九星気学: {candidateKyusei} ・ 六星占術:{" "}
                {candidateRokusei?.label}
                {candidateRokusei?.reigou ? "(霊合星人)" : ""}
              </p>
              <h3 style={{ marginTop: 0, fontSize: 14 }}>MBTIから見る基本性格</h3>
              <p>{compReport.mbtiPersonality}</p>
              <h3 style={{ fontSize: 14 }}>占いから見る性格・運勢</h3>
              <p>{compReport.fortunePersonality}</p>
              <h3 style={{ fontSize: 14 }}>総合的に見た人物像</h3>
              <p>{compReport.overallSummary}</p>
              <h3 style={{ fontSize: 14 }}>この人の扱い方</h3>
              <p style={{ marginBottom: 0 }}>{compReport.howToHandle}</p>
            </div>

            <div className="card" style={{ marginBottom: 16, padding: 0 }}>
              <div style={{ padding: "16px 16px 0" }}>
                <h3 style={{ marginTop: 0, fontSize: 14 }}>適性がある仕事</h3>
              </div>
              <div className="table-wrap" style={{ border: "none" }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ padding: "8px 12px" }}>職種</th>
                      <th style={{ padding: "8px 12px" }}>適性</th>
                      <th style={{ padding: "8px 12px" }}>理由</th>
                    </tr>
                  </thead>
                  <tbody>
                    {compReport.suitableRoles.map((r, i) => (
                      <tr key={i}>
                        <td style={{ padding: "8px 12px", fontWeight: 500, whiteSpace: "nowrap" }}>
                          {r.role}
                        </td>
                        <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                          <StarRating stars={r.stars} />
                        </td>
                        <td style={{ padding: "8px 12px", fontSize: 13 }}>{r.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 260 }}>
                  <h3 style={{ marginTop: 0, fontSize: 14 }}>相性がいいタイプ(一般的傾向)</h3>
                  {compReport.goodCompatibility.map((c, i) => (
                    <div key={i} style={{ marginBottom: 10 }}>
                      <span className="badge">{c.type}</span>
                      <p style={{ margin: "4px 0 0", fontSize: 13 }}>{c.reason}</p>
                    </div>
                  ))}
                </div>
                <div style={{ flex: 1, minWidth: 260 }}>
                  <h3 style={{ marginTop: 0, fontSize: 14 }}>相性が悪いタイプ(一般的傾向)</h3>
                  {compReport.badCompatibility.map((c, i) => (
                    <div key={i} style={{ marginBottom: 10 }}>
                      <span className="badge">{c.type}</span>
                      <p style={{ margin: "4px 0 0", fontSize: 13 }}>{c.reason}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="card" style={{ padding: 0 }}>
              <div style={{ padding: "16px 16px 0" }}>
                <h3 style={{ marginTop: 0, fontSize: 14 }}>社員との相性</h3>
                <p className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>
                  MBTI・九星気学・六星占術の傾向に基づく参考値です(社員側にMBTI・生年月日が登録されている場合のみ表示されます)。
                </p>
              </div>
              {employeeScores.length === 0 ? (
                <p className="text-muted" style={{ padding: 16, marginBottom: 0 }}>
                  表示できる社員データがありません。
                </p>
              ) : (
                <div className="table-wrap" style={{ border: "none" }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th style={{ padding: "8px 12px" }}>社員</th>
                        <th style={{ padding: "8px 12px" }}>スコア</th>
                        <th style={{ padding: "8px 12px" }}>評価</th>
                      </tr>
                    </thead>
                    <tbody>
                      {employeeScores.map((s) => (
                        <tr key={s.id}>
                          <td style={{ padding: "8px 12px", fontWeight: 500 }}>
                            {s.name}
                            {s.department && (
                              <span className="text-muted" style={{ fontSize: 11, marginLeft: 6 }}>
                                {s.department}
                              </span>
                            )}
                          </td>
                          <td style={{ padding: "8px 12px", fontWeight: 600 }}>{s.score}点</td>
                          <td style={{ padding: "8px 12px" }}>
                            <span
                              style={{
                                display: "inline-block",
                                width: 10,
                                height: 10,
                                borderRadius: "50%",
                                background: compatScoreColor(s.score),
                                marginRight: 6,
                                verticalAlign: "middle",
                              }}
                            />
                            {compatScoreLabel(s.score)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}