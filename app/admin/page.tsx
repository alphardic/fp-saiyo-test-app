"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

interface SessionRow {
  id: string;
  status: string;
  submitted_at: string | null;
  candidates: { name: string; email: string } | null;
}

interface CandidateRow {
  id: string;
  name: string;
  email: string;
  invite_token: string;
  created_at: string;
}

/**
 * 管理者向けダッシュボードの骨組み。
 * 受験セッション一覧の表示 + 候補者の新規招待フォーム。
 * TODO: 分野別スコアのグラフ表示、レポートPDFへのリンクなどを追加していく。
 */
export default function AdminDashboardPage() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [candidates, setCandidates] = useState<CandidateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
    load();
  }, []);

  async function load() {
    const { data: userData } = await supabaseBrowser.auth.getUser();
    if (!userData.user) {
      setAuthError("ログインが必要です。");
      setLoading(false);
      return;
    }

    const { data: sessionData, error: sessionError } = await supabaseBrowser
      .from("exam_sessions")
      .select("id, status, submitted_at, candidates(name, email)")
      .order("submitted_at", { ascending: false });

    const { data: candidateData, error: candidateError } = await supabaseBrowser
      .from("candidates")
      .select("id, name, email, invite_token, created_at")
      .order("created_at", { ascending: false });

    if (sessionError || candidateError) {
      setAuthError(
        "データの取得に失敗しました(管理者権限が付与されているか確認してください)。"
      );
    } else {
      setSessions((sessionData as unknown as SessionRow[]) ?? []);
      setCandidates((candidateData as CandidateRow[]) ?? []);
    }
    setLoading(false);
  }

  async function handleAddCandidate() {
    setAddError(null);
    if (!name || !email) {
      setAddError("名前とメールアドレスを入力してください。");
      return;
    }
    setAdding(true);
    const { error } = await supabaseBrowser
      .from("candidates")
      .insert({ name, email });
    setAdding(false);

    if (error) {
      setAddError(
        error.code === "23505"
          ? "このメールアドレスは既に登録されています。"
          : "登録に失敗しました: " + error.message
      );
      return;
    }

    setName("");
    setEmail("");
    await load();
  }

  async function copyLink(token: string) {
    const link = origin + "/exam/" + token;
    try {
      await navigator.clipboard.writeText(link);
      alert("リンクをコピーしました:\n" + link);
    } catch {
      prompt("このリンクをコピーしてください:", link);
    }
  }

  if (loading) return <p style={{ padding: 24 }}>読み込み中...</p>;
  if (authError)
    return (
      <main style={{ padding: 24 }}>
        <p>{authError}</p>
        <a href="/admin/login">ログイン画面へ</a>
      </main>
    );

  return (
    <main style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <h1>候補者の招待</h1>
      <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <input
          type="text"
          placeholder="氏名"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ padding: 8, flex: "1 1 160px" }}
        />
        <input
          type="email"
          placeholder="メールアドレス"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ padding: 8, flex: "1 1 220px" }}
        />
        <button onClick={handleAddCandidate} disabled={adding}>
          {adding ? "登録中..." : "候補者を追加"}
        </button>
      </div>
      {addError && <p style={{ color: "red" }}>{addError}</p>}

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 32 }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>氏名</th>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>メール</th>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>受験リンク</th>
          </tr>
        </thead>
        <tbody>
          {candidates.map((c) => (
            <tr key={c.id}>
              <td>{c.name}</td>
              <td>{c.email}</td>
              <td>
                <button onClick={() => copyLink(c.invite_token)}>
                  リンクをコピー
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h1>受験状況一覧</h1>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>候補者</th>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>状態</th>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>提出日時</th>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>レポート</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => (
            <tr key={s.id}>
              <td>{s.candidates?.name ?? "-"}</td>
              <td>{s.status}</td>
              <td>{s.submitted_at ?? "-"}</td>
              <td>
                {s.status === "graded" ? (
                  <a href={"/admin/report/" + s.id}>詳細を見る</a>
                ) : (
                  "採点待ち"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}