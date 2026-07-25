"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

interface AdminRow {
  user_id: string;
  email: string | null;
  role: "super_admin" | "admin";
  created_at: string;
}

const ROLE_LABEL: Record<string, string> = {
  super_admin: "最高権限者",
  admin: "管理者",
};

export default function AdminsPage() {
  const [myRole, setMyRole] = useState<string | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSent, setInviteSent] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function getAccessToken(): Promise<string | null> {
    const { data } = await supabaseBrowser.auth.getSession();
    return data.session?.access_token ?? null;
  }

  async function load() {
    setLoading(true);
    setError(null);
    const token = await getAccessToken();
    if (!token) {
      setError("ログインが必要です。");
      setLoading(false);
      return;
    }

    const [meRes, listRes] = await Promise.all([
      fetch("/api/admin/me", { headers: { Authorization: "Bearer " + token } }),
      fetch("/api/admin/admins", { headers: { Authorization: "Bearer " + token } }),
    ]);

    if (!meRes.ok || !listRes.ok) {
      const body = await listRes.json().catch(() => ({}));
      setError(body.error || "データの取得に失敗しました。");
      setLoading(false);
      return;
    }

    const me = await meRes.json();
    const list = await listRes.json();
    setMyRole(me.role);
    setMyUserId(me.userId);
    setAdmins(list.admins ?? []);
    setLoading(false);
  }

  async function handleInvite() {
    setInviteError(null);
    setInviteSent(false);
    if (!inviteEmail) {
      setInviteError("メールアドレスを入力してください。");
      return;
    }
    const token = await getAccessToken();
    if (!token) {
      setInviteError("ログインが必要です。");
      return;
    }

    setInviting(true);
    const res = await fetch("/api/admin/admins", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({ email: inviteEmail }),
    });
    setInviting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setInviteError(body.error || "招待に失敗しました。");
      return;
    }

    setInviteEmail("");
    setInviteSent(true);
    await load();
  }

  async function handleDelete(userId: string) {
    if (!confirm("この管理者を削除しますか？")) return;
    const token = await getAccessToken();
    if (!token) return;

    setDeletingId(userId);
    const res = await fetch(`/api/admin/admins?userId=${encodeURIComponent(userId)}`, {
      method: "DELETE",
      headers: { Authorization: "Bearer " + token },
    });
    setDeletingId(null);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.error || "削除に失敗しました。");
      return;
    }
    await load();
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

  if (myRole !== "super_admin") {
    return (
      <main className="page page-narrow">
        <div className="card">
          <div className="alert alert-error" style={{ marginBottom: 12 }}>
            この画面は最高権限者のみ利用できます。
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
        <h1 style={{ marginTop: 8 }}>管理者管理</h1>
        <p>管理者の招待・削除ができます(最高権限者のみ)。</p>
      </div>

      <div className="section">
        <div className="section-title">
          <span className="dot" />
          <h2>管理者を招待</h2>
        </div>
        <div className="card">
          <div className="form-row" style={{ marginBottom: 16 }}>
            <div className="field">
              <label htmlFor="invite-email">メールアドレス</label>
              <input
                id="invite-email"
                type="email"
                placeholder="new-admin@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
            </div>
            <button onClick={handleInvite} disabled={inviting} className="btn btn-primary">
              {inviting ? "送信中..." : "招待メールを送信"}
            </button>
          </div>
          {inviteError && <div className="alert alert-error">{inviteError}</div>}
          {inviteSent && (
            <div className="alert alert-success" style={{ marginBottom: 0 }}>
              招待メールを送信しました。本人がリンクからパスワードを設定するとログインできます。
            </div>
          )}
        </div>
      </div>

      <div className="section" style={{ marginBottom: 0 }}>
        <div className="section-title">
          <span className="dot" />
          <h2>管理者一覧</h2>
        </div>
        <div className="card">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>メールアドレス</th>
                  <th>権限</th>
                  <th>登録日</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {admins.map((a) => (
                  <tr key={a.user_id}>
                    <td>{a.email ?? "-"}</td>
                    <td>
                      <span className={a.role === "super_admin" ? "badge badge-done" : "badge badge-muted"}>
                        {ROLE_LABEL[a.role] ?? a.role}
                      </span>
                    </td>
                    <td className="text-muted">{a.created_at}</td>
                    <td>
                      {a.user_id !== myUserId && (
                        <button
                          onClick={() => handleDelete(a.user_id)}
                          disabled={deletingId === a.user_id}
                          className="btn btn-outline btn-sm"
                        >
                          {deletingId === a.user_id ? "削除中..." : "削除"}
                        </button>
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