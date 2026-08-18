"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { formatMbti } from "@/lib/mbti";

interface Employee {
  id: string;
  name: string;
  email: string | null;
  department: string | null;
  birthdate: string | null;
  mbti: string | null;
  notes: string | null;
  invited_by: string | null;
  created_at: string;
}

interface Rokusei {
  star: string;
  sign: "+" | "-";
  label: string;
  reigou: boolean;
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

function StarRating({ stars }: { stars: number }) {
  return (
    <span style={{ color: "#c9a24b", letterSpacing: 1 }}>
      {"★".repeat(stars)}
      <span style={{ color: "#dcdfe4" }}>{"★".repeat(5 - stars)}</span>
    </span>
  );
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

interface ReportResponse {
  employee: Employee;
  kyuseiStar: string;
  rokusei: Rokusei;
  report: ComprehensiveReport;
}

export default function EmployeeReportPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<ReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingRoles, setSavingRoles] = useState(false);
  const [savedRolesAt, setSavedRolesAt] = useState<string | null>(null);
  const [saveRolesError, setSaveRolesError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const { data: sessionData } = await supabaseBrowser.auth.getSession();
        const accessToken = sessionData.session?.access_token;
        if (!accessToken) {
          throw new Error("ログインが必要です。");
        }
        const res = await fetch(`/api/admin/employees/${params.id}/report`, {
          headers: { Authorization: "Bearer " + accessToken },
        });
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error || "レポートの取得に失敗しました。");
        }
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "エラーが発生しました。");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (params.id) load();
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  async function saveSuitableRoles() {
    setSaveRolesError(null);
    setSavingRoles(true);
    try {
      const { data: sessionData } = await supabaseBrowser.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("ログインが必要です。");
      const res = await fetch(`/api/admin/employees/${params.id}/suitable-roles`, {
        method: "POST",
        headers: { Authorization: "Bearer " + accessToken },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "保存に失敗しました。");
      setSavedRolesAt(json.generatedAt);
    } catch (e) {
      setSaveRolesError(e instanceof Error ? e.message : "エラーが発生しました。");
    } finally {
      setSavingRoles(false);
    }
  }

  return (
    <div className="page">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <button className="btn btn-outline btn-sm" onClick={() => router.push("/admin/employees")}>
          ← 社員一覧に戻る
        </button>
      </div>

      {loading && <p className="text-muted">レポートを生成しています…</p>}

      {error && (
        <div className="alert alert-error">
          <p>{error}</p>
        </div>
      )}

      {data && (
        <>
          <div className="card" style={{ marginBottom: 20 }}>
            <h1 style={{ marginTop: 0 }}>{data.employee.name} さんの総合レポート</h1>
            <p className="text-muted" style={{ marginBottom: 0 }}>
              {data.employee.department ? `${data.employee.department} ・ ` : ""}
              MBTI: {formatMbti(data.employee.mbti)} ・ 九星気学: {data.kyuseiStar} ・ 六星占術:{" "}
              {data.rokusei.label}
              {data.rokusei.reigou ? "(霊合星人)" : ""}
            </p>
          </div>

          <div className="section">
            <h2 className="section-title">MBTIから見る基本性格</h2>
            <div className="card">
              <p>{data.report.mbtiPersonality}</p>
            </div>
          </div>

          <div className="section">
            <h2 className="section-title">占いから見る性格・運勢</h2>
            <div className="card">
              <p>{data.report.fortunePersonality}</p>
            </div>
          </div>

          <div className="section">
            <h2 className="section-title">総合的に見た人物像</h2>
            <div className="card">
              <p>{data.report.overallSummary}</p>
            </div>
          </div>

          <div className="section">
            <h2 className="section-title">この人の扱い方</h2>
            <div className="card">
              <p>{data.report.howToHandle}</p>
            </div>
          </div>

          <div className="section">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              <h2 className="section-title">適性がある仕事</h2>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {savedRolesAt && (
                  <span className="text-muted" style={{ fontSize: 12 }}>
                    保存しました({new Date(savedRolesAt).toLocaleString("ja-JP")})
                  </span>
                )}
                <button
                  onClick={saveSuitableRoles}
                  disabled={savingRoles}
                  className="btn btn-outline btn-sm"
                >
                  {savingRoles ? "保存中..." : "適性職種を保存する"}
                </button>
              </div>
            </div>
            {saveRolesError && (
              <div className="alert alert-error" style={{ marginBottom: 12 }}>
                {saveRolesError}
              </div>
            )}
            <p className="text-muted" style={{ fontSize: 12, marginTop: -4 }}>
              保存すると「配属シミュレーション」画面でこの社員の適性★評価を参照できるようになります。
            </p>
            <div className="card" style={{ padding: 0 }}>
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
                    {data.report.suitableRoles.map((r, i) => (
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
          </div>

          <div className="section">
            <h2 className="section-title">相性</h2>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <div className="card" style={{ flex: 1, minWidth: 280 }}>
                <h3 style={{ marginTop: 0 }}>相性がいいタイプ</h3>
                {data.report.goodCompatibility.map((c, i) => (
                  <div key={i} style={{ marginBottom: 10 }}>
                    <span className="badge">{c.type}</span>
                    <p style={{ margin: "4px 0 0" }}>{c.reason}</p>
                  </div>
                ))}
              </div>
              <div className="card" style={{ flex: 1, minWidth: 280 }}>
                <h3 style={{ marginTop: 0 }}>相性が悪いタイプ</h3>
                {data.report.badCompatibility.map((c, i) => (
                  <div key={i} style={{ marginBottom: 10 }}>
                    <span className="badge">{c.type}</span>
                    <p style={{ margin: "4px 0 0" }}>{c.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {data.employee.notes && (
            <div className="section">
              <h2 className="section-title">備考</h2>
              <div className="card">
                <p>{data.employee.notes}</p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}