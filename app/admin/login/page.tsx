"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [resetMode, setResetMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetLoading, setResetLoading] = useState(false);

  async function handleLogin() {
    setError(null);
    setLoading(true);
    const { error } = await supabaseBrowser.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError("メールアドレスまたはパスワードが正しくありません。");
      return;
    }
    window.location.href = "/admin";
  }

  async function handleResetRequest() {
    setResetError(null);
    setResetSent(false);
    if (!email) {
      setResetError("メールアドレスを入力してください。");
      return;
    }
    setResetLoading(true);
    const { error } = await supabaseBrowser.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/admin/set-password`,
    });
    setResetLoading(false);
    if (error) {
      setResetError(error.message);
      return;
    }
    setResetSent(true);
  }

  if (resetMode) {
    return (
      <main className="page page-narrow">
        <div className="page-header">
          <h1>パスワード再設定</h1>
          <p>登録済みのメールアドレスにパスワード再設定用リンクを送信します。</p>
        </div>

        <div className="card">
          {resetSent ? (
            <div className="alert alert-success" style={{ marginBottom: 0 }}>
              {email} 宛に再設定用のリンクを送信しました。メールをご確認ください。
            </div>
          ) : (
            <div>
              <div className="field">
                <label htmlFor="reset-email">メールアドレス</label>
                <input
                  id="reset-email"
                  type="email"
                  placeholder="admin@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleResetRequest()}
                />
              </div>
              {resetError && <div className="alert alert-error">{resetError}</div>}
              <button
                onClick={handleResetRequest}
                disabled={resetLoading || !email}
                className="btn btn-primary btn-block"
              >
                {resetLoading ? "送信中..." : "再設定用リンクを送信"}
              </button>
            </div>
          )}
          <button
            onClick={() => setResetMode(false)}
            className="btn btn-outline btn-block mt-24"
          >
            ログイン画面に戻る
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="page page-narrow">
      <div className="page-header">
        <h1>管理者ログイン</h1>
        <p>メールアドレスとパスワードでログインしてください。</p>
      </div>

      <div className="card">
        <div className="field">
          <label htmlFor="email">メールアドレス</label>
          <input
            id="email"
            type="email"
            placeholder="admin@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="password">パスワード</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
          />
        </div>
        {error && <div className="alert alert-error">{error}</div>}
        <button
          onClick={handleLogin}
          disabled={loading || !email || !password}
          className="btn btn-primary btn-block"
        >
          {loading ? "ログイン中..." : "ログイン"}
        </button>
        <button
          onClick={() => setResetMode(true)}
          className="btn btn-outline btn-block mt-24"
        >
          パスワードを忘れた方はこちら
        </button>
      </div>

      <p className="footnote">
        ※ 管理者として招待されたメールアドレスのみログインできます。
      </p>
    </main>
  );
}