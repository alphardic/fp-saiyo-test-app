"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

interface Newsletter {
  id: string;
  status: "draft" | "sent" | "discarded";
  subject: string;
  body: string;
  created_by: string | null;
  created_at: string;
  sent_at: string | null;
  sent_by: string | null;
}

const STATUS_LABEL: Record<Newsletter["status"], string> = {
  draft: "確認待ち",
  sent: "送信済み",
  discarded: "取りやめ",
};

function formatDateTime(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  });
}

export default function NewsletterAdminPage() {
  const [newsletters, setNewsletters] = useState<Newsletter[]>([]);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState<"create" | "save" | "send" | "discard" | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const draft = newsletters.find((n) => n.status === "draft") ?? null;
  const history = newsletters.filter((n) => n.status !== "draft");
  const canEdit = role === "super_admin";
  const dirty = !!draft && (subject !== draft.subject || body !== draft.body);

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    setSubject(draft?.subject ?? "");
    setBody(draft?.body ?? "");
  }, [draft?.id, draft?.subject, draft?.body]);

  async function getAccessToken(): Promise<string | null> {
    const { data } = await supabaseBrowser.auth.getSession();
    return data.session?.access_token ?? null;
  }

  async function load() {
    const token = await getAccessToken();
    if (!token) {
      setLoadError("ログインが必要です。");
      setLoading(false);
      return;
    }
    const res = await fetch("/api/admin/newsletters", {
      headers: { Authorization: "Bearer " + token },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setLoadError(data.error || "データの取得に失敗しました。");
      setLoading(false);
      return;
    }
    setNewsletters(data.newsletters ?? []);
    setRole(data.role ?? null);
    setLoading(false);
  }

  async function call(
    kind: "create" | "save" | "send" | "discard",
    url: string,
    method: string,
    payload?: unknown
  ): Promise<boolean> {
    const token = await getAccessToken();
    if (!token) return false;
    setBusy(kind);
    setMessage(null);
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
    setBusy(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setMessage({ ok: false, text: data.error || "失敗しました。" });
      return false;
    }
    return true;
  }

  async function createDraft() {
    if (await call("create", "/api/admin/newsletters", "POST")) {
      setMessage({ ok: true, text: "下書きができました。内容を確認してください。" });
      await load();
    }
  }

  async function saveDraft() {
    if (!draft) return;
    if (await call("save", `/api/admin/newsletters/${draft.id}`, "PUT", { subject, body })) {
      setMessage({ ok: true, text: "修正を保存しました。" });
      await load();
    }
  }

  async function sendDraft() {
    if (!draft) return;
    if (dirty) {
      setMessage({ ok: false, text: "保存していない修正があります。先に「修正を保存」を押してください。" });
      return;
    }
    if (!confirm("all_alpha@alpha-fp.com(社員全員)に、この内容で送ります。よろしいですか？")) return;
    if (await call("send", `/api/admin/newsletters/${draft.id}/send`, "POST")) {
      setMessage({ ok: true, text: "全社員に送りました。" });
      await load();
    }
  }

  async function discardDraft() {
    if (!draft) return;
    if (!confirm("この下書きは送らずに取りやめます。よろしいですか？")) return;
    if (await call("discard", `/api/admin/newsletters/${draft.id}/discard`, "POST")) {
      setMessage({ ok: true, text: "取りやめました。次の下書きは、次回の定期作成か「今すぐ下書きを作る」で作れます。" });
      await load();
    }
  }

  if (loading) {
    return (
      <main className="page">
        <p className="text-muted">読み込み中...</p>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="page page-narrow">
        <div className="card">
          <div className="alert alert-error" style={{ marginBottom: 12 }}>
            {loadError}
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
        <h1 style={{ marginTop: 8 }}>社内テストのお知らせメール</h1>
        <p>
          毎月1日と15日の朝9時に、AIが社内テストの利用状況から下書きを作り、tanaka@alpha-fp.com に確認のお願いを送ります。
          内容を確認して「全社員に送る」を押したときだけ、all_alpha@alpha-fp.com(社員全員)に届きます。
        </p>
      </div>

      {message && (
        <div className={`alert ${message.ok ? "alert-info" : "alert-error"}`}>{message.text}</div>
      )}

      <div className="section">
        <div className="section-title">
          <span className="dot" />
          <h2>確認待ちの下書き</h2>
        </div>

        {!draft ? (
          <div className="card">
            <p className="text-muted" style={{ marginTop: 0 }}>
              確認待ちの下書きはありません。
            </p>
            {canEdit && (
              <button onClick={createDraft} disabled={busy !== null} className="btn btn-primary btn-sm">
                {busy === "create" ? "作成中(1分ほどかかります)..." : "今すぐ下書きを作る"}
              </button>
            )}
          </div>
        ) : (
          <div className="card">
            <p className="text-muted" style={{ marginTop: 0, fontSize: 13 }}>
              作成: {formatDateTime(draft.created_at)}
              {draft.created_by === "schedule" ? "(定期作成)" : `(${draft.created_by ?? "-"})`}
              {!canEdit && " ── 修正・送信は最高権限者だけができます。"}
            </p>
            <div className="field">
              <label htmlFor="newsletter-subject">件名</label>
              <input
                id="newsletter-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                disabled={!canEdit}
              />
            </div>
            <div className="field">
              <label htmlFor="newsletter-body">本文</label>
              <textarea
                id="newsletter-body"
                rows={20}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                disabled={!canEdit}
              />
            </div>
            {canEdit && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  onClick={saveDraft}
                  disabled={busy !== null || !dirty}
                  className="btn btn-outline btn-sm"
                >
                  {busy === "save" ? "保存中..." : "修正を保存"}
                </button>
                <button onClick={sendDraft} disabled={busy !== null} className="btn btn-primary btn-sm">
                  {busy === "send" ? "送信中..." : "全社員に送る"}
                </button>
                <button
                  onClick={discardDraft}
                  disabled={busy !== null}
                  className="btn btn-outline btn-sm"
                >
                  送らずに取りやめる
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="section" style={{ marginBottom: 0 }}>
        <div className="section-title">
          <span className="dot" />
          <h2>これまでのメール</h2>
        </div>
        {history.length === 0 ? (
          <div className="card">
            <p className="text-muted" style={{ marginBottom: 0 }}>
              まだありません。
            </p>
          </div>
        ) : (
          <div className="card" style={{ padding: 0 }}>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>状態</th>
                    <th>件名</th>
                    <th>送信日時</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((n) => (
                    <tr key={n.id}>
                      <td className="text-muted" style={{ whiteSpace: "nowrap" }}>
                        {STATUS_LABEL[n.status]}
                      </td>
                      <td>
                        <div style={{ fontWeight: 500 }}>{n.subject}</div>
                        {openId === n.id && (
                          <div
                            className="text-muted"
                            style={{ whiteSpace: "pre-wrap", fontSize: 13, marginTop: 8 }}
                          >
                            {n.body}
                          </div>
                        )}
                      </td>
                      <td className="text-muted" style={{ whiteSpace: "nowrap" }}>
                        {formatDateTime(n.sent_at)}
                      </td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        <button
                          onClick={() => setOpenId((cur) => (cur === n.id ? null : n.id))}
                          className="btn btn-outline btn-sm"
                        >
                          {openId === n.id ? "閉じる" : "本文を見る"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
