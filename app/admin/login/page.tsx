"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setError(null);
    setLoading(true);
    const { error } = await supabaseBrowser.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/admin`,
      },
    });
    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      setSent(true);
    }
  }

  return (
    <main className="page page-narrow">
      <div className="page-header">
        <h1>管理者ログイン</h1>
        <p>登録済みのメールアドレスにログイン用リンクを送信します。</p>
      </div>

      <div className="card">
        {sent ? (
          <div className="alert alert-success" style={{ marginBottom: 0 }}>
            {email} 宛にログイン用のリンクを送信しました。メールをご確認ください。
          </div>
        ) : (
          <div>
            <div className="field">
              <label htmlFor="email">メールアドレス</label>
              <input
                id="email"
                type="email"
                placeholder="admin@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              />
            </div>
            {error && <div className="alert alert-error">{error}</div>}
            <button
              onClick={handleLogin}
              disabled={loading || !email}
              className="btn btn-primary btn-block"
            >
              {loading ? "送信中..." : "ログインリンクを送信"}
            </button>
          </div>
        )}
      </div>

      <p className="footnote">
        ※ このメールアドレスが admins テーブルに登録されている必要があります。
      </p>
    </main>
  );
}