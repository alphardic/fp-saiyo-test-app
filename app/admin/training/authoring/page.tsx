"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

interface AuthoringCourse {
  id: string;
  name: string;
  status: "draft" | "pending" | "rejected";
  authorName: string | null;
  pointCount: number;
  questionCount: number;
  submittedAt: string | null;
  createdAt: string;
}

const STATUS_LABEL: Record<AuthoringCourse["status"], string> = {
  draft: "作成中",
  pending: "承認待ち",
  rejected: "差し戻し",
};

/**
 * 管理者向け: 社員が作成した社内テストの承認一覧。
 */
export default function TrainingAuthoringAdminPage() {
  const [courses, setCourses] = useState<AuthoringCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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

  async function copyAuthorLink() {
    const link = window.location.origin + "/training/author";
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
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

  const pending = courses.filter((c) => c.status === "pending");
  const others = courses.filter((c) => c.status !== "pending");

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
              <th>申請日</th>
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
                  {c.submittedAt ? new Date(c.submittedAt).toLocaleDateString("ja-JP") : "-"}
                </td>
                <td style={{ textAlign: "right" }}>
                  <a href={`/admin/training/authoring/${c.id}`} className="btn btn-outline btn-sm">
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
        <h1 style={{ marginTop: 8 }}>社員が作ったテストの承認</h1>
        <p>社員がAIと作った社内テストを確認し、承認すると受験に使えるようになります。</p>
      </div>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}>
          {error}
        </div>
      )}

      <div className="section">
        <div className="card">
          <p style={{ fontWeight: 600, marginBottom: 4 }}>社員向け 作問ページのリンク</p>
          <p className="text-muted" style={{ marginBottom: 12, fontSize: 13 }}>
            このリンクを社員に共有すると、本人が氏名・会社のメールアドレスを入力して、自分専用の作問ページでテストを作れます。
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={copyAuthorLink} className="btn btn-outline btn-sm">
              {copied ? "コピーしました" : "作問ページのリンクをコピー"}
            </button>
            <a href="/admin/training/rules" className="btn btn-outline btn-sm">
              作問ルール(AIが学習した内容)を見る
            </a>
          </div>
        </div>
      </div>

      <div className="section">
        <div className="section-title">
          <span className="dot" />
          <h2>承認待ち({pending.length}件)</h2>
        </div>
        {pending.length === 0 ? (
          <div className="card">
            <p className="text-muted" style={{ marginBottom: 0 }}>
              承認待ちのテストはありません。
            </p>
          </div>
        ) : (
          renderTable(pending)
        )}
      </div>

      {others.length > 0 && (
        <div className="section">
          <div className="section-title">
            <span className="dot" />
            <h2>作成中・差し戻し中</h2>
          </div>
          {renderTable(others)}
        </div>
      )}
    </main>
  );
}
