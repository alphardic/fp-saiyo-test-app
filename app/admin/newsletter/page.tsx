"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

interface Redline {
  at: string;
  by: string;
  feedback: string;
  before: { subject: string; body: string };
  aiNote: string;
}

interface Meta {
  issueMonth?: string;
  agents?: {
    analysis: string;
    ideas: { title: string; who: string; how: string; why: string }[];
    writerDraft: { subject: string; body: string };
    reviewNote: string;
  };
  redlines?: Redline[];
  approval?: { scheduledFor: string; by: string; at: string } | null;
  deliveryError?: string;
}

interface Newsletter {
  id: string;
  status: "draft" | "sent" | "discarded";
  subject: string;
  body: string;
  stats: Meta | null;
  created_by: string | null;
  created_at: string;
  sent_at: string | null;
  sent_by: string | null;
}

type Busy = "create" | "save" | "revise" | "approve" | "unapprove" | "send" | "discard" | "notify" | null;

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

function issueLabel(issueMonth?: string): string {
  return issueMonth ? `${Number(issueMonth.split("-")[1])}月号` : "";
}

function jpDay(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${m}月${d}日`;
}

const preStyle = { whiteSpace: "pre-wrap" as const, fontSize: 13, lineHeight: 1.7 };

export default function NewsletterAdminPage() {
  const [newsletters, setNewsletters] = useState<Newsletter[]>([]);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState<Busy>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const draft = newsletters.find((n) => n.status === "draft") ?? null;
  const meta: Meta = draft?.stats ?? {};
  const history = newsletters.filter((n) => n.status !== "draft");
  const canEdit = role === "super_admin";
  const dirty = !!draft && (subject !== draft.subject || body !== draft.body);
  const sendDay = meta.issueMonth ? jpDay(`${meta.issueMonth}-01`) : "1日";

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
    kind: Exclude<Busy, null>,
    url: string,
    method: string,
    payload?: unknown
  ): Promise<Record<string, unknown> | null> {
    const token = await getAccessToken();
    if (!token) return null;
    setBusy(kind);
    setMessage(null);
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
    setBusy(null);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage({ ok: false, text: data.error || "失敗しました。" });
      return null;
    }
    return data;
  }

  function blockIfDirty(): boolean {
    if (!dirty) return false;
    setMessage({ ok: false, text: "保存していない修正があります。先に「手直しを保存」を押してください。" });
    return true;
  }

  async function createDraft() {
    if (draft && !confirm("今の下書きは取りやめになり、4人のAIが一から作り直します。よろしいですか？")) return;
    if (await call("create", "/api/admin/newsletters", "POST")) {
      setMessage({ ok: true, text: "下書きができました。内容を確認してください。" });
      await load();
    }
  }

  async function saveDraft() {
    if (!draft) return;
    if (await call("save", `/api/admin/newsletters/${draft.id}`, "PUT", { subject, body })) {
      setMessage({
        ok: true,
        text: meta.approval ? "保存しました。内容が変わったので、承認は取り消されました。" : "保存しました。",
      });
      await load();
    }
  }

  async function revise() {
    if (!draft || blockIfDirty()) return;
    const result = await call("revise", `/api/admin/newsletters/${draft.id}/revise`, "POST", { feedback });
    if (result) {
      setFeedback("");
      setMessage({ ok: true, text: "AIが赤入れを反映しました。直した内容を確認してください。" });
      await load();
    }
  }

  async function approve() {
    if (!draft || blockIfDirty()) return;
    const result = await call("approve", `/api/admin/newsletters/${draft.id}/approve`, "POST");
    if (result) {
      setMessage({
        ok: true,
        text: result.deliveredNow
          ? "承認しました。配信日を過ぎていたので、いま全社員に送りました。"
          : `承認しました。${jpDay(String(result.scheduledFor))}の朝9時に全社員へ配信します。`,
      });
      await load();
    }
  }

  async function unapprove() {
    if (!draft) return;
    if (await call("unapprove", `/api/admin/newsletters/${draft.id}/approve`, "DELETE")) {
      setMessage({ ok: true, text: "承認を取り消しました。このままでは配信されません。" });
      await load();
    }
  }

  async function sendNow() {
    if (!draft || blockIfDirty()) return;
    if (!confirm("配信日を待たずに、all_alpha@alpha-fp.com(社員全員)へ今すぐ送ります。よろしいですか？")) return;
    if (await call("send", `/api/admin/newsletters/${draft.id}/send`, "POST")) {
      setMessage({ ok: true, text: "全社員に送りました。" });
      await load();
    }
  }

  async function resendNotice() {
    if (!draft) return;
    if (await call("notify", `/api/admin/newsletters/${draft.id}/notify`, "POST")) {
      setMessage({ ok: true, text: "tanaka@alpha-fp.com に赤入れのお願いメールを送りました。届いているか確認してください。" });
    }
  }

  async function discardDraft() {
    if (!draft) return;
    if (!confirm("この号は送らずに取りやめます。よろしいですか？")) return;
    if (await call("discard", `/api/admin/newsletters/${draft.id}/discard`, "POST")) {
      setMessage({ ok: true, text: "取りやめました。次の号は、来月25日にAIが作ります。" });
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
          毎月25日に、4人のAI(分析・発想・文章・仕上げ)が翌月号の下書きを作り、tanaka@alpha-fp.com に赤入れのお願いを送ります。
          赤入れを書くとAIが直します。「承認」を押した号だけが、翌月1日の朝9時に「アルファグループの知識を高めるAIくん」から
          all_alpha@alpha-fp.com(社員全員)へ届きます。
        </p>
      </div>

      {message && (
        <div className={`alert ${message.ok ? "alert-info" : "alert-error"}`}>{message.text}</div>
      )}

      <div className="section">
        <div className="section-title">
          <span className="dot" />
          <h2>確認待ちの下書き{meta.issueMonth ? `(${issueLabel(meta.issueMonth)})` : ""}</h2>
        </div>

        {!draft ? (
          <div className="card">
            <p className="text-muted" style={{ marginTop: 0 }}>
              確認待ちの下書きはありません。
            </p>
            {canEdit && (
              <button onClick={createDraft} disabled={busy !== null} className="btn btn-primary btn-sm">
                {busy === "create" ? "4人のAIが作成中(3〜5分かかります)..." : "今すぐ下書きを作る"}
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="card">
              {meta.approval ? (
                <div className="alert alert-info" style={{ marginTop: 0 }}>
                  承認済み: {jpDay(meta.approval.scheduledFor)}の朝9時に全社員へ配信します。
                </div>
              ) : (
                <div className="alert alert-error" style={{ marginTop: 0 }}>
                  まだ承認されていません。{sendDay}の朝9時に配信するには「承認」を押してください。
                </div>
              )}
              {meta.deliveryError && (
                <div className="alert alert-error">前回の配信に失敗しました: {meta.deliveryError}</div>
              )}
              <p className="text-muted" style={{ fontSize: 13 }}>
                作成: {formatDateTime(draft.created_at)}
                {draft.created_by === "schedule" ? "(定期作成)" : `(${draft.created_by ?? "-"})`}
                {(meta.redlines?.length ?? 0) > 0 && ` ・ 赤入れ ${meta.redlines!.length}回`}
                {!canEdit && " ── 赤入れ・承認は最高権限者だけができます。"}
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
                <label htmlFor="newsletter-body">本文(ここで直接手直しもできます)</label>
                <textarea
                  id="newsletter-body"
                  rows={22}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  disabled={!canEdit}
                />
              </div>
              {canEdit && (
                <button
                  onClick={saveDraft}
                  disabled={busy !== null || !dirty}
                  className="btn btn-outline btn-sm"
                >
                  {busy === "save" ? "保存中..." : "手直しを保存"}
                </button>
              )}
            </div>

            {canEdit && (
              <div className="card">
                <h3 style={{ marginTop: 0 }}>赤入れ(AIに直してもらう)</h3>
                <p className="text-muted" style={{ fontSize: 13, marginTop: 0 }}>
                  直してほしいことを書いてください。例:「冒頭の季節のあいさつをもっと短く」「2つ目の使い方は削除」「期初らしく、今期の目標に絡めた一言を入れて」。
                  赤入れはAIが覚えて、来月以降の号にも生かします。
                </p>
                <div className="field">
                  <textarea
                    rows={4}
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    placeholder="直してほしいこと"
                  />
                </div>
                <button
                  onClick={revise}
                  disabled={busy !== null || !feedback.trim()}
                  className="btn btn-primary btn-sm"
                >
                  {busy === "revise" ? "AIが直しています(1分ほど)..." : "AIくんに直してもらう"}
                </button>
              </div>
            )}

            {canEdit && (
              <div className="card">
                <h3 style={{ marginTop: 0 }}>承認・配信</h3>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {meta.approval ? (
                    <button onClick={unapprove} disabled={busy !== null} className="btn btn-outline btn-sm">
                      {busy === "unapprove" ? "取り消し中..." : "承認を取り消す"}
                    </button>
                  ) : (
                    <button onClick={approve} disabled={busy !== null} className="btn btn-primary btn-sm">
                      {busy === "approve" ? "承認中..." : `承認する(${sendDay}朝9時に配信)`}
                    </button>
                  )}
                  <button onClick={sendNow} disabled={busy !== null} className="btn btn-outline btn-sm">
                    {busy === "send" ? "送信中..." : "今すぐ全社員に送る"}
                  </button>
                  <button onClick={createDraft} disabled={busy !== null} className="btn btn-outline btn-sm">
                    {busy === "create" ? "作り直し中(3〜5分)..." : "4人のAIで一から作り直す"}
                  </button>
                  <button onClick={resendNotice} disabled={busy !== null} className="btn btn-outline btn-sm">
                    {busy === "notify" ? "送信中..." : "赤入れのお願いメールを自分に再送"}
                  </button>
                  <button onClick={discardDraft} disabled={busy !== null} className="btn btn-outline btn-sm">
                    この号は送らない
                  </button>
                </div>
              </div>
            )}

            {meta.agents && (
              <div className="card">
                <h3 style={{ marginTop: 0 }}>4人のAIの作業メモ</h3>
                <details open>
                  <summary style={{ cursor: "pointer", fontWeight: 500 }}>④ 仕上げ担当(季節感・人間味)から田中さんへ</summary>
                  <div className="text-muted" style={{ ...preStyle, margin: "8px 0 12px" }}>
                    {meta.agents.reviewNote}
                  </div>
                </details>
                <details>
                  <summary style={{ cursor: "pointer", fontWeight: 500 }}>① 分析担当: どう使われたか</summary>
                  <div className="text-muted" style={{ ...preStyle, margin: "8px 0 12px" }}>
                    {meta.agents.analysis}
                  </div>
                </details>
                <details>
                  <summary style={{ cursor: "pointer", fontWeight: 500 }}>② 発想担当: こんな使い方ができる</summary>
                  <div style={{ margin: "8px 0 12px" }}>
                    {meta.agents.ideas.map((idea, i) => (
                      <div key={i} className="text-muted" style={{ fontSize: 13, marginBottom: 8 }}>
                        <strong>{idea.title}</strong>(だれが: {idea.who})
                        <br />
                        {idea.how}
                        <br />
                        うれしいこと: {idea.why}
                      </div>
                    ))}
                  </div>
                </details>
                <details>
                  <summary style={{ cursor: "pointer", fontWeight: 500 }}>③ 文章担当の下書き(仕上げ前)</summary>
                  <div className="text-muted" style={{ ...preStyle, margin: "8px 0 12px" }}>
                    件名: {meta.agents.writerDraft.subject}
                    {"\n\n"}
                    {meta.agents.writerDraft.body}
                  </div>
                </details>
              </div>
            )}

            {(meta.redlines?.length ?? 0) > 0 && (
              <div className="card">
                <h3 style={{ marginTop: 0 }}>赤入れの履歴</h3>
                {meta.redlines!.map((r, i) => (
                  <details key={i} style={{ marginBottom: 8 }}>
                    <summary style={{ cursor: "pointer" }}>
                      {formatDateTime(r.at)} 「{r.feedback.length > 40 ? r.feedback.slice(0, 40) + "…" : r.feedback}」
                    </summary>
                    <div className="text-muted" style={{ ...preStyle, margin: "8px 0" }}>
                      <strong>赤入れ:</strong> {r.feedback}
                      {"\n\n"}
                      <strong>AIのメモ:</strong>
                      {"\n"}
                      {r.aiNote}
                      {"\n\n"}
                      <strong>直す前:</strong>
                      {"\n"}件名: {r.before.subject}
                      {"\n"}
                      {r.before.body}
                    </div>
                  </details>
                ))}
              </div>
            )}
          </>
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
                    <th>号</th>
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
                        {issueLabel(n.stats?.issueMonth) || "-"}
                      </td>
                      <td className="text-muted" style={{ whiteSpace: "nowrap" }}>
                        {STATUS_LABEL[n.status]}
                      </td>
                      <td>
                        <div style={{ fontWeight: 500 }}>{n.subject}</div>
                        {openId === n.id && (
                          <div className="text-muted" style={{ ...preStyle, marginTop: 8 }}>
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
