"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

interface SessionRow {
  id: string;
  status: string;
  submitted_at: string | null;
  candidates: { name: string; email: string } | null;
}

/**
 * 管理者向けダッシュボードの骨組み。
 * 現状は受験セッション一覧の表示のみ。
 * TODO: 分野別スコアのグラフ表示、レポートPDFへのリンク、
 * 候補者の新規招待フォームなどを追加していく。
 */
export default function AdminDashboardPage() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data: userData } = await supabaseBrowser.auth.getUser();
      if (!userData.user) {
        setAuthError("ログインが必要です。");
        setLoading(false);
        return;
      }

      const { data, error } = await supabaseBrowser
        .from("exam_sessions")
        .select("id, status, submitted_at, candidates(name, email)")
        .order("submitted_at", { ascending: false });

      if (error) {
        setAuthError(
          "データの取得に失敗しました(管理者権限が付与されているか確認してください)。"
        );
      } else {
        setSessions((data as unknown as SessionRow[]) ?? []);
      }
      setLoading(false);
    }
    load();
  }, []);

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
                  <a href={`/admin/report/${s.id}`}>詳細を見る</a>
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
