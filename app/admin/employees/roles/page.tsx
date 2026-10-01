"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { JOB_ROLES, type RoleFitEntry } from "@/lib/aiGrading";

interface EmployeeRow {
  id: string;
  name: string;
  department: string | null;
  mbti: string | null;
  birthdate: string | null;
  suitable_roles: RoleFitEntry[] | null;
  suitable_roles_generated_at: string | null;
}

// 星の数に応じたセル背景色(0=未評価)。数が多いほど濃いゴールド。
const STAR_BG: Record<number, string> = {
  0: "transparent",
  1: "#fbf4e2",
  2: "#f4e6bd",
  3: "#ecd595",
  4: "#e2c366",
  5: "#d4a93b",
};

function StarRating({ stars }: { stars: number }) {
  return (
    <span style={{ color: "#c9a24b", letterSpacing: 1, whiteSpace: "nowrap" }}>
      {"★".repeat(stars)}
      <span style={{ color: "#dcdfe4" }}>{"★".repeat(5 - stars)}</span>
    </span>
  );
}

function starsFor(e: EmployeeRow, role: string): number {
  const hit = (e.suitable_roles ?? []).find((r) => r.role === role);
  return hit ? hit.stars : 0;
}

function reasonFor(e: EmployeeRow, role: string): string {
  const hit = (e.suitable_roles ?? []).find((r) => r.role === role);
  return hit?.reason ?? "";
}

export default function EmployeeRolesPage() {
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const { data } = await supabaseBrowser.auth.getSession();
    const token = data.session?.access_token ?? null;
    if (!token) {
      setAuthError("ログインが必要です。");
      setLoading(false);
      return;
    }
    const res = await fetch("/api/admin/employees", {
      headers: { Authorization: "Bearer " + token },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setAuthError(body.error || "データの取得に失敗しました。");
      setLoading(false);
      return;
    }
    const body = await res.json();
    setEmployees(body.employees ?? []);
    setLoading(false);
  }

  // 適性職種が生成済みの社員のみを対象にする(部署→氏名の順で並べる)
  const rated = useMemo(
    () =>
      employees
        .filter((e) => Array.isArray(e.suitable_roles) && e.suitable_roles.length > 0)
        .sort((a, b) => {
          const d = (a.department ?? "").localeCompare(b.department ?? "", "ja");
          return d !== 0 ? d : a.name.localeCompare(b.name, "ja");
        }),
    [employees]
  );

  const missing = useMemo(
    () =>
      employees.filter(
        (e) => !(Array.isArray(e.suitable_roles) && e.suitable_roles.length > 0)
      ),
    [employees]
  );

  // 職種ごとに、星の多い順に並べた社員リスト
  const ranking = useMemo(() => {
    return JOB_ROLES.map((role) => {
      const people = rated
        .map((e) => ({ e, stars: starsFor(e, role) }))
        .filter((x) => x.stars > 0)
        .sort((a, b) => b.stars - a.stars || a.e.name.localeCompare(b.e.name, "ja"));
      const top = people.length > 0 ? people[0].stars : 0;
      return { role, people, top };
    });
  }, [rated]);

  if (loading) {
    return (
      <main className="page">
        <p className="text-muted">読み込み中...</p>
      </main>
    );
  }

  if (authError) {
    return (
      <main className="page page-narrow">
        <div className="card">
          <div className="alert alert-error" style={{ marginBottom: 12 }}>
            {authError}
          </div>
          <a href="/admin/login" className="btn btn-outline">
            ログイン画面へ
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="page page-wide">
      <div className="page-header">
        <a href="/admin/employees" className="text-muted" style={{ fontSize: 13 }}>
          ← 社員一覧へ戻る
        </a>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <div>
            <h1 style={{ marginTop: 8 }}>職種別 適性マップ</h1>
            <p>
              各社員の総合レポートで保存された「適性がある仕事」の★評価を職種ごとに集計し、
              誰がどの職種に向いているかを一覧できます。
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <a href="/admin/employees/assignment" className="btn btn-outline btn-sm">
              配属シミュレーション
            </a>
          </div>
        </div>
      </div>

      {rated.length === 0 ? (
        <div className="card">
          <p style={{ margin: 0 }}>
            適性職種が保存された社員がまだいません。各社員の「総合レポート」画面で
            「適性職種を保存する」を押すか、「配属シミュレーション」画面で一括生成してください。
          </p>
        </div>
      ) : (
        <>
          {missing.length > 0 && (
            <div className="alert alert-info" style={{ marginBottom: 16, fontSize: 13 }}>
              {missing.length}名(
              {missing
                .slice(0, 5)
                .map((e) => e.name)
                .join("、")}
              {missing.length > 5 ? " ほか" : ""}
              )は適性職種が未生成のため、この一覧には含まれていません。
              「配属シミュレーション」画面でまとめて生成できます。
            </div>
          )}

          {/* 職種別の得意な人ランキング(ひと目で分かる一覧) */}
          <div className="section">
            <div className="section-title">
              <span className="dot" />
              <h2>職種別・得意な人</h2>
            </div>
            <p className="text-muted" style={{ fontSize: 12, marginTop: -4 }}>
              各職種で★が多い順。👑 はその職種で最も適性が高い人です。
            </p>
            <div className="card" style={{ padding: 0 }}>
              <div className="table-wrap" style={{ border: "none" }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>職種</th>
                      <th style={{ padding: "8px 12px" }}>得意な人(★の多い順)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ranking.map(({ role, people, top }) => (
                      <tr key={role}>
                        <td
                          style={{
                            padding: "8px 12px",
                            fontWeight: 600,
                            whiteSpace: "nowrap",
                            verticalAlign: "top",
                          }}
                        >
                          {role}
                        </td>
                        <td style={{ padding: "8px 12px" }}>
                          {people.length === 0 ? (
                            <span className="text-muted" style={{ fontSize: 13 }}>
                              データなし
                            </span>
                          ) : (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                              {people.map(({ e, stars }) => {
                                const isTop = stars === top;
                                return (
                                  <a
                                    key={e.id}
                                    href={"/admin/employees/" + e.id}
                                    title={reasonFor(e, role)}
                                    className="badge"
                                    style={{
                                      textDecoration: "none",
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: 6,
                                      background: isTop ? "#fff8e6" : undefined,
                                      border: isTop ? "1px solid #c9a24b" : undefined,
                                      fontWeight: isTop ? 600 : 400,
                                    }}
                                  >
                                    {isTop ? "👑 " : ""}
                                    {e.name}
                                    {e.department ? (
                                      <span className="text-muted" style={{ fontSize: 11 }}>
                                        ({e.department})
                                      </span>
                                    ) : null}
                                    <StarRating stars={stars} />
                                  </a>
                                );
                              })}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* 職種 × 社員 のマトリクス(色が濃いほど適性が高い) */}
          <div className="section" style={{ marginBottom: 0 }}>
            <div className="section-title">
              <span className="dot" />
              <h2>適性マトリクス</h2>
            </div>
            <p className="text-muted" style={{ fontSize: 12, marginTop: -4 }}>
              数字は★の数(1〜5)。色が濃いほど適性が高く、各職種の最高評価には枠を付けています。
              空欄はその職種が評価に含まれていない社員です。氏名クリックで総合レポートを開きます。
            </p>
            <div className="card" style={{ padding: 0 }}>
              <div className="table-wrap">
                <table className="table" style={{ fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th
                        style={{
                          padding: "8px 12px",
                          position: "sticky",
                          left: 0,
                          background: "var(--color-surface, #fff)",
                          zIndex: 1,
                          whiteSpace: "nowrap",
                        }}
                      >
                        職種 \ 社員
                      </th>
                      {rated.map((e) => (
                        <th
                          key={e.id}
                          style={{ padding: "8px 10px", whiteSpace: "nowrap", textAlign: "center" }}
                        >
                          <a href={"/admin/employees/" + e.id} style={{ textDecoration: "none" }}>
                            {e.name}
                          </a>
                          {e.department ? (
                            <div className="text-muted" style={{ fontSize: 10, fontWeight: 400 }}>
                              {e.department}
                            </div>
                          ) : null}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ranking.map(({ role, top }) => (
                      <tr key={role}>
                        <td
                          style={{
                            padding: "8px 12px",
                            fontWeight: 600,
                            whiteSpace: "nowrap",
                            position: "sticky",
                            left: 0,
                            background: "var(--color-surface, #fff)",
                            zIndex: 1,
                          }}
                        >
                          {role}
                        </td>
                        {rated.map((e) => {
                          const stars = starsFor(e, role);
                          const isTop = stars > 0 && stars === top;
                          return (
                            <td
                              key={e.id}
                              title={reasonFor(e, role)}
                              style={{
                                padding: "6px 8px",
                                textAlign: "center",
                                background: STAR_BG[stars] ?? "transparent",
                                fontWeight: isTop ? 700 : 400,
                                color: stars >= 4 ? "#3d2f00" : stars === 0 ? "#c0c4cc" : "#5a4a1a",
                                outline: isTop ? "2px solid #c9a24b" : undefined,
                                outlineOffset: isTop ? "-2px" : undefined,
                              }}
                            >
                              {stars > 0 ? stars : "–"}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
