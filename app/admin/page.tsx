"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

interface SessionRow {
  id: string;
  status: string;
  submitted_at: string | null;
  candidates: { name: string; email: string } | null;
}

interface CandidateRow {
  id: string;
  name: string;
  email: string;
  invite_token: string;
  created_at: string;
}

const STATUS_LABEL: Record<string, string> = {
  not_started: "未受験",
  in_progress: "受験中",
  submitted: "採点待ち",
  graded: "採点済み",
};

function StatusBadge({ status }: { status: string }) {
  const label = STATUS_LABEL[status] ?? status;
  let cls = "badge badge-muted";
  if (status === "in_progress" || status === "submitted") cls = "badge badge-progress";
  if (status === "graded") cls = "badge badge-done";
  return <span className={cls}>{label}</span>;
}

/**
 * 管理者向けダッシュボード。
 * データ取得・候補者登録はサーバー側API(/api/admin/*)経由で行う
 * (RLS越しの直接アクセスがSupabase側のJWT検証の問題で不安定なため)。
 */
export default function AdminDashboardPage() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [candidates, setCandidates] = useState<CandidateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [gradingId, setGradingId] = useState<string | null>(null);
  const [gradeError, setGradeError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showInviteList, setShowInviteList] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
    load();
  }, []);

  async function getAccessToken(): Promise<string | null> {
    const { data } = await supabaseBrowser.auth.getSession();
    return data.session?.access_token ?? null;
  }

  async function load() {
    const token = await getAccessToken();
    if (!token) {
      setAuthError("ログインが必要です。");
      setLoading(false);
      return;
    }

    const res = await fetch("/api/admin/dashboard", {
      headers: { Authorization: "Bearer " + token },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setAuthError(
        body.error ||
          "データの取得に失敗しました(管理者権限が付与されているか確認してください)。"
      );
      setLoading(false);
      return;
    }

    const body = await res.json();
    setCandidates(body.candidates ?? []);
    setSessions(body.sessions ?? []);
    setLoading(false);
  }

  async function handleAddCandidate() {
    setAddError(null);
    if (!name || !email) {
      setAddError("名前とメールアドレスを入力してください。");
      return;
    }
    const token = await getAccessToken();
    if (!token) {
      setAddError("ログインが必要です。");
      return;
    }

    setAdding(true);
    const res = await fetch("/api/admin/candidates", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({ name, email }),
    });
    setAdding(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setAddError(body.error || "登録に失敗しました。");
      return;
    }

    setName("");
    setEmail("");
    await load();
  }

  async function gradeSession(sessionId: string) {
    setGradeError(null);
    const token = await getAccessToken();
    if (!token) {
      setGradeError("ログインが必要です。");
      return;
    }
    setGradingId(sessionId);
    const res = await fetch(`/api/admin/sessions/${sessionId}/grade`, {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
    });
    setGradingId(null);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setGradeError(body.error || "採点に失敗しました。");
      return;
    }

    await load();
  }

  function toggleSelect(sessionId: string) {
    setSelectedIds((cur) =>
      cur.includes(sessionId) ? cur.filter((x) => x !== sessionId) : [...cur, sessionId]
    );
    setShowInviteList(false);
  }

  function selectAllNotStarted() {
    setSelectedIds(sessions.filter((s) => s.status === "not_started").map((s) => s.id));
    setShowInviteList(false);
  }

  function clearSelection() {
    setSelectedIds([]);
    setShowInviteList(false);
  }

  const canCompare =
    selectedIds.length >= 2 &&
    selectedIds.every((id) => sessions.find((s) => s.id === id)?.status === "graded");

  function goToCompare() {
    if (!canCompare) return;
    window.location.href = "/admin/compare?ids=" + selectedIds.join(",");
  }

  function buildInviteListText(): string {
    const blocks: string[] = [];
    for (const id of selectedIds) {
      const s = sessions.find((x) => x.id === id);
      if (!s || !s.candidates) continue;
      const cand = candidates.find((c) => c.email === s.candidates!.email);
      if (!cand) continue;
      const link = origin + "/exam/" + cand.invite_token;
      blocks.push(`${cand.name} <${cand.email}>\n${link}`);
    }
    return blocks.join("\n\n");
  }

  async function copyInviteList() {
    const text = buildInviteListText();
    try {
      await navigator.clipboard.writeText(text);
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 2000);
    } catch {
      prompt("この内容をコピーしてください:", text);
    }
  }

  async function copyLink(id: string, token: string) {
    const link = origin + "/exam/" + token;
    try {
      await navigator.clipboard.writeText(link);
      setCopiedId(id);
      setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 2000);
    } catch {
      prompt("このリンクをコピーしてください:", link);
    }
  }

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
        <h1>管理ダッシュボード</h1>
        <p>候補者の招待と受験状況を管理します。</p>
      </div>

      <div className="section">
        <div className="section-title">
          <span className="dot" />
          <h2>候補者の招待</h2>
        </div>

        <div className="card">
          <div className="form-row" style={{ marginBottom: 16 }}>
            <div className="field">
              <label htmlFor="cand-name">氏名</label>
              <input
                id="cand-name"
                type="text"
                placeholder="山田 太郎"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="cand-email">メールアドレス</label>
              <input
                id="cand-email"
                type="email"
                placeholder="taro@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <button onClick={handleAddCandidate} disabled={adding} className="btn btn-primary">
              {adding ? "登録中..." : "候補者を追加"}
            </button>
          </div>
          {addError && <div className="alert alert-error" style={{ marginBottom: 0 }}>{addError}</div>}

          <div className="table-wrap" style={{ marginTop: addError ? 16 : 0 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>氏名</th>
                  <th>メール</th>
                  <th>受験リンク</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td className="text-muted">{c.email}</td>
                    <td>
                      <button
                        onClick={() => copyLink(c.id, c.invite_token)}
                        className="btn btn-outline btn-sm"
                      >
                        {copiedId === c.id ? "コピーしました" : "リンクをコピー"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {candidates.length === 0 && (
              <div className="table-empty">まだ候補者が登録されていません。</div>
            )}
          </div>
        </div>
      </div>

      <div className="section" style={{ marginBottom: 0 }}>
        <div className="section-title">
          <span className="dot" />
          <h2>受験状況一覧</h2>
        </div>

        <div className="card">
          {gradeError && <div className="alert alert-error">{gradeError}</div>}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 8,
              marginBottom: 12,
            }}
          >
            <span className="text-muted" style={{ fontSize: 13 }}>
              候補者にチェックを入れると、比較(採点済み2〜6名)や招待リンクの一括表示ができます。
            </span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={selectAllNotStarted} className="btn btn-outline btn-sm">
                未受験の全員を選択
              </button>
              <button
                onClick={clearSelection}
                disabled={selectedIds.length === 0}
                className="btn btn-outline btn-sm"
              >
                選択解除
              </button>
              <button
                onClick={() => setShowInviteList(true)}
                disabled={selectedIds.length === 0}
                className="btn btn-outline btn-sm"
              >
                招待リンクを一覧表示
              </button>
              <button onClick={goToCompare} disabled={!canCompare} className="btn btn-primary btn-sm">
                選択した{selectedIds.length}名を比較する
              </button>
            </div>
          </div>

          {showInviteList && (
            <div
              className="card"
              style={{ background: "#f7f8fa", marginBottom: 16, padding: 16 }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 600 }}>
                  招待リンク一覧({selectedIds.length}名)
                </span>
                <button onClick={copyInviteList} className="btn btn-outline btn-sm">
                  {inviteCopied ? "コピーしました" : "全てコピー"}
                </button>
              </div>
              <textarea
                readOnly
                value={buildInviteListText()}
                rows={Math.max(4, selectedIds.length * 3)}
                style={{
                  width: "100%",
                  fontFamily: "monospace",
                  fontSize: 12,
                  padding: 8,
                  boxSizing: "border-box",
                }}
              />
            </div>
          )}

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th></th>
                  <th>候補者</th>
                  <th>状態</th>
                  <th>提出日時</th>
                  <th>レポート</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(s.id)}
                        onChange={() => toggleSelect(s.id)}
                      />
                    </td>
                    <td>{s.candidates?.name ?? "-"}</td>
                    <td>
                      <StatusBadge status={s.status} />
                    </td>
                    <td className="text-muted">{s.submitted_at ?? "-"}</td>
                    <td>
                      {s.status === "graded" ? (
                        <a href={"/admin/report/" + s.id}>詳細を見る</a>
                      ) : s.status === "submitted" ? (
                        <button
                          onClick={() => gradeSession(s.id)}
                          disabled={gradingId === s.id}
                          className="btn btn-outline btn-sm"
                        >
                          {gradingId === s.id ? "採点中..." : "採点する"}
                        </button>
                      ) : (
                        <span className="text-muted">未受験</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {sessions.length === 0 && (
              <div className="table-empty">まだ受験データがありません。</div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}