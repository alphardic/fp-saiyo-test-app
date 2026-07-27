"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/browser";

interface Candidate {
  id: string;
  name: string;
  email: string;
  invite_token: string;
  created_at: string;
}

interface SessionRow {
  id: string;
  candidate_id: string;
  status: "not_started" | "in_progress" | "completed";
  started_at: string | null;
  completed_at: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  not_started: "未受験",
  in_progress: "受験中",
  completed: "完了",
};

const STATUS_BADGE: Record<string, string> = {
  not_started: "badge-muted",
  in_progress: "badge-progress",
  completed: "badge-done",
};

export default function LogicTestAdminPage() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [registering, setRegistering] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);

  async function authHeader() {
    const { data } = await supabaseBrowser.auth.getSession();
    return { authorization: `Bearer ${data.session?.access_token ?? ""}` };
  }

  async function load() {
    setLoading(true);
    setError(null);
    const headers = await authHeader();
    const res = await fetch("/api/logic-admin/candidates", { headers });
    const data = (await res.json()) as {
      error?: string;
      candidates?: Candidate[];
      sessions?: SessionRow[];
    };
    if (!res.ok) {
      setError(data.error ?? "読み込みに失敗しました。");
      setLoading(false);
      return;
    }
    setCandidates(data.candidates ?? []);
    setSessions(data.sessions ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleRegister() {
    if (!name || !email) {
      setRegisterError("氏名とメールアドレスを入力してください。");
      return;
    }
    setRegistering(true);
    setRegisterError(null);
    const headers = await authHeader();
    const res = await fetch("/api/logic-admin/candidates", {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ name, email }),
    });
    setRegistering(false);
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setRegisterError(data.error ?? "登録に失敗しました。");
      return;
    }
    setName("");
    setEmail("");
    await load();
  }

  function sessionFor(candidateId: string) {
    return sessions.find((s) => s.candidate_id === candidateId);
  }

  function inviteLink(token: string) {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/logic-exam/${token}`;
  }

  async function copyLink(token: string) {
    const link = inviteLink(token);
    const text = `【ロジカルシンキング適性テスト】\n${link}`;
    try {
      await navigator.clipboard.writeText(text);
      alert("リンクをコピーしました。");
    } catch {
      prompt("以下のリンクをコピーしてください", text);
    }
  }

  return (
    <main className="page page-wide">
      <div className="page-header">
        <h1>ロジカルシンキング適性テスト 管理</h1>
        <p>
          <Link href="/admin">← 通常の管理画面に戻る</Link>
        </p>
      </div>

      <div className="alert alert-info">
        通常は通常の管理画面(候補者登録)から両方のテストのリンクが同時に発行されます。
        このページは、ロジカルテストのみを単独で受けてもらいたい場合や、既存候補者一覧の確認用です。
      </div>

      <div className="section">
        <div className="section-title">
          <span className="dot" />
          <h2>候補者登録(単独発行)</h2>
        </div>
        <div className="card">
          <div className="form-row">
            <div className="field">
              <label>氏名</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="field">
              <label>メールアドレス</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <button onClick={handleRegister} disabled={registering} className="btn btn-primary">
              {registering ? "登録中..." : "登録"}
            </button>
          </div>
          {registerError && <div className="alert alert-error mt-24">{registerError}</div>}
        </div>
      </div>

      <div className="section">
        <div className="section-title">
          <span className="dot" />
          <h2>候補者一覧</h2>
        </div>
        <div className="card">
          {loading ? (
            <p className="text-muted">読み込み中...</p>
          ) : error ? (
            <div className="alert alert-error">{error}</div>
          ) : candidates.length === 0 ? (
            <div className="table-empty">候補者が登録されていません。</div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>氏名</th>
                    <th>メールアドレス</th>
                    <th>状況</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((c) => {
                    const session = sessionFor(c.id);
                    const status = session?.status ?? "not_started";
                    return (
                      <tr key={c.id}>
                        <td>{c.name}</td>
                        <td>{c.email}</td>
                        <td>
                          <span className={`badge ${STATUS_BADGE[status]}`}>
                            {STATUS_LABEL[status]}
                          </span>
                        </td>
                        <td>
                          <button
                            onClick={() => copyLink(c.invite_token)}
                            className="btn btn-outline btn-sm"
                          >
                            招待リンクをコピー
                          </button>
                          {status === "completed" && session && (
                            <Link
                              href={`/admin/logic-test/report/${session.id}`}
                              className="btn btn-gold btn-sm"
                              style={{ marginLeft: 8 }}
                            >
                              レポートを見る
                            </Link>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}