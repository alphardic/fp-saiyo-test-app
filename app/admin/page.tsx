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
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>候補者</th>
                  <th>状態</th>
                  <th>提出日時</th>
                  <th>レポート</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id}>
                    <td>{s.candidates?.name ?? "-"}</td>
                    <td>
                      <StatusBadge status={s.status} />
                    </td>
                    <td className="text-muted">{s.submitted_at ?? "-"}</td>
                    <td>
                      {s.status === "graded" ? (
                        <a href={"/admin/report/" + s.id}>詳細を見る</a>
                      ) : (
                        <span className="text-muted">採点待ち</span>
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