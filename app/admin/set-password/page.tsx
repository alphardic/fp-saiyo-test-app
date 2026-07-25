"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

/**
 * 招待メール・パスワード再設定メールのリンク先。
 * SupabaseがURLのハッシュから一時セッションを自動的に確立するので、
 * このページでは単純にパスワードを入力してupdateUserするだけでよい。
 */
export default function SetPasswordPage() {
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const { data: listener } = supabaseBrowser.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setReady(true);
      }
    });
    supabaseBrowser.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  async function handleSubmit() {
    setError(null);
    if (password.length < 8) {
      setError("パスワードは8文字以上にしてください。");
      return;
    }
    if (password !== password2) {
      setError("パスワードが一致しません。");
      return;
    }
    setLoading(true);
    const { error } = await supabaseBrowser.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setDone(true);
    setTimeout(() => {
      window.location.href = "/admin";
    }, 1500);
  }

  if (done) {
    return (
      <main className="page page-narrow">
        <div className="card">
          <div className="alert alert-success" style={{ marginBottom: 0 }}>
            パスワードを設定しました。管理画面に移動します...
          </div>
        </div>
      </main>
    );
  }

  if (!ready) {
    return (
      <main className="page page-narrow">
        <div className="card">
          <p className="text-muted" style={{ marginBottom: 0 }}>
            確認中です。しばらくお待ちください...
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="page page-narrow">
      <div className="page-header">
        <h1>パスワードの設定</h1>
        <p>ログインに使う新しいパスワードを設定してください。</p>
      </div>

      <div className="card">
        <div className="field">
          <label htmlFor="new-password">新しいパスワード(8文字以上)</label>
          <input
            id="new-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="new-password2">新しいパスワード(確認)</label>
          <input
            id="new-password2"
            type="password"
            value={password2}
            onChange={(e) => setPassword2(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          />
        </div>
        {error && <div className="alert alert-error">{error}</div>}
        <button
          onClick={handleSubmit}
          disabled={loading || !password || !password2}
          className="btn btn-primary btn-block"
        >
          {loading ? "設定中..." : "パスワードを設定する"}
        </button>
      </div>
    </main>
  );
}