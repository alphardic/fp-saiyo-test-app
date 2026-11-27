"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

/**
 * 管理画面: カリキュラムの受講者を招待し、一人ひとりの進み具合を見る。
 * カリキュラムの作成・並べ替えは社員用ポータル(/training/portal/curricula)で行う。
 */

interface ProgressItem {
  courseId: string;
  name: string;
  available: boolean;
  hasVideo: boolean;
  videoCompleted: boolean;
  videoPercent: number;
  passed: boolean;
  attemptCount: number;
  locked: boolean;
}

interface Curriculum {
  id: string;
  name: string;
  description: string | null;
  items: { courseId: string; name: string; status: string; hasVideo: boolean }[];
  enrollments: { employeeId: string; token: string; invitedAt: string; items: ProgressItem[] }[];
}

interface Employee {
  id: string;
  name: string;
  department: string | null;
}

function cell(p: ProgressItem): { text: string; color?: string } {
  if (!p.available) return { text: "準備中" };
  if (p.passed) return { text: "🟢 合格", color: "var(--color-success, #1a7f37)" };
  if (p.attemptCount > 0) return { text: "🔴 不合格", color: "var(--color-error)" };
  if (p.locked) return { text: "🔒" };
  if (p.hasVideo) return { text: p.videoCompleted ? "🟡 視聴済み" : p.videoPercent > 0 ? `🟡 動画${p.videoPercent}%` : "⚪ 未受講" };
  return { text: "⚪ 未受講" };
}

export default function AdminCurriculaPage() {
  const [curricula, setCurricula] = useState<Curriculum[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [inviting, setInviting] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

  async function token(): Promise<string | null> {
    const { data } = await supabaseBrowser.auth.getSession();
    return data.session?.access_token ?? null;
  }

  async function load() {
    const t = await token();
    if (!t) {
      setError("ログインが必要です。");
      setLoading(false);
      return;
    }
    const res = await fetch("/api/admin/training/curricula", { headers: { Authorization: "Bearer " + t } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error ?? "読み込みに失敗しました。");
    } else {
      setCurricula(body.curricula ?? []);
      setEmployees(body.employees ?? []);
      setSelectedId((prev) => prev || body.curricula?.[0]?.id || "");
    }
    setLoading(false);
  }

  useEffect(() => {
    setOrigin(window.location.origin);
    load();
  }, []);

  const selected = curricula.find((c) => c.id === selectedId) ?? null;
  const enrolledIds = useMemo(() => new Set(selected?.enrollments.map((e) => e.employeeId) ?? []), [selected]);
  const uninvited = employees.filter((e) => !enrolledIds.has(e.id));

  async function invite() {
    if (!selected || selectedEmployees.length === 0) return;
    const t = await token();
    if (!t) return;
    setInviting(true);
    setMessage(null);
    const res = await fetch(`/api/admin/training/curricula/${selected.id}/invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + t },
      body: JSON.stringify({ employeeIds: selectedEmployees }),
    });
    const body = await res.json().catch(() => ({}));
    setInviting(false);
    if (!res.ok) {
      setMessage({ ok: false, text: body.error ?? "招待に失敗しました。" });
      return;
    }
    setMessage({ ok: true, text: `${selectedEmployees.length}名を招待しました。各人のリンクをコピーして送ってください。` });
    setSelectedEmployees([]);
    await load();
  }

  async function copy(text: string, key: string) {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  function noticeText(c: Curriculum): string {
    const lines = c.enrollments
      .filter((e) => e.items.some((i) => i.available && !i.passed))
      .map((e) => {
        const name = employees.find((x) => x.id === e.employeeId)?.name ?? "";
        return `・${name} さん: ${origin}/training/curriculum/${e.token}`;
      });
    return `【研修のご案内】「${c.name}」\n下のリンクから、上から順に受講してください(動画を最後まで見るとテストを受けられます)。\n\n${lines.join("\n")}`;
  }

  if (loading) {
    return (
      <main className="page page-narrow">
        <p className="text-muted">読み込み中...</p>
      </main>
    );
  }

  return (
    <main className="page page-wide">
      <div className="page-header">
        <a href="/admin/training" className="text-muted" style={{ fontSize: 13 }}>
          ← 分野別社内テストへ戻る
        </a>
        <h1 style={{ marginTop: 8 }}>カリキュラム</h1>
        <p>
          テストを順番に並べた研修コースです。作成・並べ替えは社員用ポータルの「カリキュラムの管理」で行います。ここでは受講者の招待と進み具合の確認をします。
        </p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {message && <div className={`alert ${message.ok ? "alert-success" : "alert-error"}`}>{message.text}</div>}

      {!error && curricula.length === 0 && (
        <div className="card">
          <p className="text-muted" style={{ margin: 0 }}>
            まだカリキュラムがありません。社員用ポータル(/training/portal)の「カリキュラムの管理」から作成してください。
          </p>
        </div>
      )}

      {curricula.length > 0 && (
        <div className="section">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {curricula.map((c) => (
              <button
                key={c.id}
                className={`btn btn-sm ${c.id === selectedId ? "btn-primary" : "btn-outline"}`}
                onClick={() => {
                  setSelectedId(c.id);
                  setSelectedEmployees([]);
                  setMessage(null);
                }}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {selected && (
        <>
          <div className="section">
            <div className="card">
              <p style={{ fontWeight: 700, fontSize: 18, margin: 0 }}>{selected.name}</p>
              {selected.description && <p className="text-muted">{selected.description}</p>}
              <ol style={{ paddingLeft: 20, marginBottom: 0 }}>
                {selected.items.map((i) => (
                  <li key={i.courseId}>
                    {i.name}
                    <span className="text-muted" style={{ fontSize: 12, marginLeft: 6 }}>
                      {i.status === "active" ? "配布中" : "準備中"}
                      {i.hasVideo ? "・動画あり" : ""}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          <div className="section">
            <div className="section-title">
              <span className="dot" />
              <h2>受講者({selected.enrollments.length}名)</h2>
            </div>
            {selected.enrollments.length === 0 ? (
              <div className="card">
                <p className="text-muted" style={{ margin: 0 }}>まだ受講者がいません。下から招待してください。</p>
              </div>
            ) : (
              <div className="card" style={{ overflowX: "auto" }}>
                <button className="btn btn-outline btn-sm" style={{ marginBottom: 12 }} onClick={() => copy(noticeText(selected), "notice")}>
                  {copied === "notice" ? "コピーしました" : "未修了の人向けの案内文をコピー"}
                </button>
                <table className="table">
                  <thead>
                    <tr>
                      <th>氏名</th>
                      {selected.items.map((i, n) => (
                        <th key={i.courseId} title={i.name} style={{ whiteSpace: "nowrap" }}>
                          STEP{n + 1}
                        </th>
                      ))}
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.enrollments.map((e) => {
                      const employee = employees.find((x) => x.id === e.employeeId);
                      return (
                        <tr key={e.employeeId}>
                          <td style={{ fontWeight: 500, whiteSpace: "nowrap" }}>{employee?.name ?? "(削除された社員)"}</td>
                          {e.items.map((p) => {
                            const c = cell(p);
                            return (
                              <td key={p.courseId} style={{ whiteSpace: "nowrap", color: c.color, fontSize: 13 }}>
                                {c.text}
                              </td>
                            );
                          })}
                          <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                            <button
                              className="btn btn-outline btn-sm"
                              onClick={() => copy(`${origin}/training/curriculum/${e.token}`, e.employeeId)}
                            >
                              {copied === e.employeeId ? "コピーしました" : "リンクをコピー"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="section">
            <div className="section-title">
              <span className="dot" />
              <h2>受講者を招待する</h2>
            </div>
            <div className="card">
              {uninvited.length === 0 ? (
                <p className="text-muted" style={{ margin: 0 }}>全員招待済みです。</p>
              ) : (
                <>
                  <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                    <button className="btn btn-outline btn-sm" onClick={() => setSelectedEmployees(uninvited.map((e) => e.id))}>
                      全員を選ぶ
                    </button>
                    <button className="btn btn-outline btn-sm" onClick={() => setSelectedEmployees([])}>
                      選択を外す
                    </button>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", marginBottom: 12 }}>
                    {uninvited.map((e) => (
                      <label key={e.id} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 14 }}>
                        <input
                          type="checkbox"
                          checked={selectedEmployees.includes(e.id)}
                          onChange={() =>
                            setSelectedEmployees((prev) =>
                              prev.includes(e.id) ? prev.filter((x) => x !== e.id) : [...prev, e.id]
                            )
                          }
                        />
                        {e.name}
                        {e.department && <span className="text-muted">({e.department})</span>}
                      </label>
                    ))}
                  </div>
                  <button className="btn btn-primary" onClick={invite} disabled={inviting || selectedEmployees.length === 0}>
                    {inviting ? "招待中..." : `${selectedEmployees.length}名を招待する`}
                  </button>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </main>
  );
}
