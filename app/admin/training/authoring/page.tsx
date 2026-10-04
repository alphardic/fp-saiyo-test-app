"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

interface AuthoringCourse {
  id: string;
  name: string;
  status: "draft" | "pending" | "rejected" | "active" | "archived";
  authorName: string | null;
  pointCount: number;
  questionCount: number;
  submittedAt: string | null;
  publishedAt: string | null;
  reviewRequested: number;
  reviewDone: number;
  enrolledCount: number;
  createdAt: string;
}

const STATUS_LABEL: Record<AuthoringCourse["status"], string> = {
  draft: "作成中",
  pending: "承認待ち",
  rejected: "差し戻し",
  active: "配布中",
  archived: "終了",
};

/**
 * 管理者向け: 社員が作った社内テストの一覧(作成中・配布中)と、社員用ページのパスワード再設定。
 */
export default function TrainingAuthoringAdminPage() {
  const [courses, setCourses] = useState<AuthoringCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetMessage, setResetMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabaseBrowser.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        setError("ログインが必要です。");
        setLoading(false);
        return;
      }
      const res = await fetch("/api/admin/training/authoring", {
        headers: { Authorization: "Bearer " + token },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) setError(body.error ?? "読み込みに失敗しました。");
      else setCourses(body.courses ?? []);
      setLoading(false);
    })();
  }, []);

  async function copyPortalLink() {
    const link = window.location.origin + "/training/portal";
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      prompt("このリンクをコピーしてください:", link);
    }
  }

  async function resetPortalPassword() {
    setResetMessage(null);
    setResetting(true);
    const { data } = await supabaseBrowser.auth.getSession();
    const res = await fetch("/api/admin/training/portal-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + (data.session?.access_token ?? ""),
      },
      body: JSON.stringify({ email: resetEmail.trim(), password: resetPassword }),
    });
    const body = await res.json().catch(() => ({}));
    setResetting(false);
    if (!res.ok) {
      setResetMessage({ ok: false, text: body.error ?? "再設定に失敗しました。" });
      return;
    }
    setResetMessage({
      ok: true,
      text: "再設定しました。本人に新しいパスワードを伝え、ログイン後に「パスワード変更」で変えてもらってください。",
    });
    setResetPassword("");
  }

  if (loading) {
    return (
      <main className="page">
        <p className="text-muted">読み込み中...</p>
      </main>
    );
  }

  const pending = courses.filter((c) => c.status === "pending");
  const active = courses.filter((c) => c.status === "active" || c.status === "archived");
  const others = courses.filter((c) => c.status === "draft" || c.status === "rejected");

  const renderTable = (rows: AuthoringCourse[]) => (
    <div className="card" style={{ padding: 0 }}>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>テスト名</th>
              <th>作成者</th>
              <th>状態</th>
              <th>知識ポイント / 問題数</th>
              <th>第三者確認</th>
              <th>受験者</th>
              <th>配布開始日</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td style={{ fontWeight: 500 }}>{c.name}</td>
                <td>{c.authorName ?? "-"}</td>
                <td>{STATUS_LABEL[c.status]}</td>
                <td className="text-muted">
                  {c.pointCount} / {c.questionCount}問
                </td>
                <td className="text-muted">
                  {c.reviewRequested === 0 ? "-" : `${c.reviewDone} / ${c.reviewRequested}人`}
                </td>
                <td className="text-muted">{c.status === "active" ? `${c.enrolledCount}人` : "-"}</td>
                <td className="text-muted">
                  {c.publishedAt ? new Date(c.publishedAt).toLocaleDateString("ja-JP") : "-"}
                </td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  {c.status === "active" && (
                    <a
                      href={`/admin/training/authoring/${c.id}?step=results`}
                      className="btn btn-outline btn-sm"
                      style={{ marginRight: 4 }}
                    >
                      結果
                    </a>
                  )}
                  <a
                    href={`/admin/training/authoring/${c.id}?step=${c.status === "pending" ? "publish" : "questions"}`}
                    className="btn btn-outline btn-sm"
                  >
                    {c.status === "pending" ? "確認する" : "見る"}
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <main className="page page-wide">
      <div className="page-header">
        <a href="/admin/training" className="text-muted" style={{ fontSize: 13 }}>
          ← 分野別社内テストへ戻る
        </a>
        <h1 style={{ marginTop: 8 }}>社員が作ったテスト</h1>
        <p>
          社員は社員用ページでAIとテストを作り、承認なしで配布できます。配布が始まると田中さんあてにお知らせメールが届きます。
          ここでは問題と受験結果をあとから確認できます。
        </p>
      </div>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}>
          {error}
        </div>
      )}

      <div className="section">
        <div className="card">
          <p style={{ fontWeight: 600, marginBottom: 4 }}>社員用ページのリンク</p>
          <p className="text-muted" style={{ marginBottom: 12, fontSize: 13 }}>
            このリンクを社員に共有すると、本人が会社のメールアドレスとパスワードで登録・ログインして、テストの作成・配布・結果の確認ができます。
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={copyPortalLink} className="btn btn-outline btn-sm">
              {copied ? "コピーしました" : "社員用ページのリンクをコピー"}
            </button>
            <a href="/admin/training/rules" className="btn btn-outline btn-sm">
              作問ルール(AIが学習した内容)を見る
            </a>
          </div>
        </div>
      </div>

      {pending.length > 0 && (
        <div className="section">
          <div className="section-title">
            <span className="dot" />
            <h2>承認待ち(以前の仕組みで申請されたもの・{pending.length}件)</h2>
          </div>
          {renderTable(pending)}
        </div>
      )}

      <div className="section">
        <div className="section-title">
          <span className="dot" />
          <h2>配布中({active.length}件)</h2>
        </div>
        {active.length === 0 ? (
          <div className="card">
            <p className="text-muted" style={{ marginBottom: 0 }}>
              配布中のテストはありません。
            </p>
          </div>
        ) : (
          renderTable(active)
        )}
      </div>

      {others.length > 0 && (
        <div className="section">
          <div className="section-title">
            <span className="dot" />
            <h2>作成中({others.length}件)</h2>
          </div>
          {renderTable(others)}
        </div>
      )}

      <div className="section">
        <div className="section-title">
          <span className="dot" />
          <h2>社員用ページのパスワード再設定</h2>
        </div>
        <div className="card">
          <p className="text-muted" style={{ marginTop: 0, fontSize: 13 }}>
            パスワードを忘れた社員の、新しいパスワードを決めて設定します(管理者アカウントは対象外です)。
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div className="field" style={{ flex: "1 1 240px", marginBottom: 0 }}>
              <label>社員のメールアドレス</label>
              <input type="email" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} />
            </div>
            <div className="field" style={{ flex: "1 1 200px", marginBottom: 0 }}>
              <label>新しいパスワード(8文字以上)</label>
              <input type="text" value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} />
            </div>
            <button
              className="btn btn-outline"
              onClick={resetPortalPassword}
              disabled={resetting || !resetEmail.trim() || resetPassword.length < 8}
            >
              {resetting ? "設定中..." : "再設定する"}
            </button>
          </div>
          {resetMessage && (
            <div className={`alert ${resetMessage.ok ? "alert-success" : "alert-error"}`} style={{ marginTop: 12 }}>
              {resetMessage.text}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
