"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin() {
    setError(null);
    // マジックリンク方式(パスワード管理不要)。Supabase Auth側の設定で有効化が必要。
    const { error } = await supabaseBrowser.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/admin`,
      },
    });
    if (error) {
      setError(error.message);
    } else {
      setSent(true);
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 420, margin: "0 auto" }}>
      <h1>管理者ログイン</h1>
      {sent ? (
        <p>{email} 宛にログイン用のリンクを送信しました。メールを確認してください。</p>
      ) : (
        <div>
          <input
            type="email"
            placeholder="admin@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: "100%", padding: 8, marginBottom: 8 }}
          />
          <button onClick={handleLogin}>ログインリンクを送信</button>
          {error && <p style={{ color: "red" }}>{error}</p>}
        </div>
      )}
      <p style={{ fontSize: 12, color: "#666", marginTop: 24 }}>
        ※ このメールアドレスが public.admins テーブルに登録されている必要があります。
      </p>
    </main>
  );
}