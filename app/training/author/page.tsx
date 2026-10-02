"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * 社員向け: 社内テストの作問ページの入口。
 * 氏名・メールアドレスを入力すると、自分専用の作問ページへ移動する。
 */
export default function TrainingAuthorRegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    if (!name.trim() || !email.trim()) {
      setError("氏名とメールアドレスを入力してください。");
      return;
    }
    setSubmitting(true);
    const res = await fetch("/api/training/authoring/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), email: email.trim() }),
    });
    const data = (await res.json().catch(() => ({}))) as { authorToken?: string; error?: string };
    setSubmitting(false);
    if (!res.ok || !data.authorToken) {
      setError(data.error ?? "登録に失敗しました。");
      return;
    }
    router.push(`/training/author/${data.authorToken}`);
  }

  return (
    <main className="page page-narrow">
      <div className="page-header">
        <h1>社内テストを作る</h1>
        <p>
          資料をもとにAIと一緒に社内テストを作り、上司の承認を受けると、社内の受験用テストとして使えるようになります。
        </p>
      </div>
      <div className="card">
        <div className="field">
          <label>氏名</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="山田 太郎" />
        </div>
        <div className="field">
          <label>会社のメールアドレス(@alpha-fp.com / @peoples-connect.com)</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        {error && (
          <div className="alert alert-error" style={{ marginBottom: 12 }}>
            {error}
          </div>
        )}
        <button className="btn btn-primary btn-block" onClick={handleSubmit} disabled={submitting}>
          {submitting ? "確認中..." : "作問ページへ進む"}
        </button>
        <p className="text-muted" style={{ fontSize: 13, marginBottom: 0 }}>
          次のページのURLがあなた専用の作問ページです。ブックマークしておくと、次回からすぐに開けます。
        </p>
      </div>
    </main>
  );
}
