"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { hasPortalSession, PORTAL_HOME_PATH } from "@/lib/trainingPortalClient";

/**
 * 社員用ポータルのログイン・新規登録ページ。
 * ログインすると、社内テストの作成・配布・受験結果の確認ができる。
 */
export default function TrainingPortalLoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    (async () => {
      if (await hasPortalSession()) {
        router.replace(PORTAL_HOME_PATH);
        return;
      }
      setChecking(false);
    })();
  }, [router]);

  async function login(emailValue: string, passwordValue: string) {
    const { error: loginError } = await supabaseBrowser.auth.signInWithPassword({
      email: emailValue,
      password: passwordValue,
    });
    if (loginError) {
      setError("メールアドレスかパスワードが違います。");
      return false;
    }
    router.push(PORTAL_HOME_PATH);
    return true;
  }

  async function handleSubmit() {
    setError(null);
    const emailValue = email.trim().toLowerCase();
    if (!emailValue || !password) {
      setError("メールアドレスとパスワードを入力してください。");
      return;
    }
    setSubmitting(true);
    try {
      if (mode === "login") {
        await login(emailValue, password);
        return;
      }
      if (!name.trim()) {
        setError("氏名を入力してください。");
        return;
      }
      if (password !== password2) {
        setError("確認用のパスワードが一致しません。");
        return;
      }
      const res = await fetch("/api/training/portal/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: emailValue, password }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "登録に失敗しました。");
        return;
      }
      await login(emailValue, password);
    } finally {
      setSubmitting(false);
    }
  }

  if (checking) {
    return (
      <main className="page page-narrow">
        <p className="text-muted">読み込み中...</p>
      </main>
    );
  }

  return (
    <main className="page page-narrow">
      <div className="page-header">
        <h1>社内テスト 社員用ページ</h1>
        <p>資料をもとにAIと社内テストを作り、社内に配布して、受験結果を確認できます。</p>
      </div>

      <div className="card">
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <button
            className={`btn btn-sm ${mode === "login" ? "btn-primary" : "btn-outline"}`}
            onClick={() => {
              setMode("login");
              setError(null);
            }}
          >
            ログイン
          </button>
          <button
            className={`btn btn-sm ${mode === "signup" ? "btn-primary" : "btn-outline"}`}
            onClick={() => {
              setMode("signup");
              setError(null);
            }}
          >
            はじめての方(新規登録)
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
        >
          {mode === "signup" && (
            <div className="field">
              <label>氏名</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="山田 太郎" />
            </div>
          )}
          <div className="field">
            <label>会社のメールアドレス(@alpha-fp.com / @peoples-connect.com)</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </div>
          <div className="field">
            <label>パスワード{mode === "signup" ? "(8文字以上)" : ""}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
            />
          </div>
          {mode === "signup" && (
            <div className="field">
              <label>パスワード(確認のためもう一度)</label>
              <input
                type="password"
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                autoComplete="new-password"
              />
            </div>
          )}
          {error && (
            <div className="alert alert-error" style={{ marginBottom: 12 }}>
              {error}
            </div>
          )}
          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            {submitting ? "確認中..." : mode === "login" ? "ログイン" : "登録してログイン"}
          </button>
        </form>
        <p className="text-muted" style={{ fontSize: 13, marginBottom: 0 }}>
          パスワードを忘れた場合は、田中さんに再設定を依頼してください。
        </p>
      </div>
    </main>
  );
}
