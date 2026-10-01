"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

interface MyCourse {
  id: string;
  name: string;
  status: "draft" | "pending" | "rejected" | "active" | "archived";
  review_comment: string | null;
  created_at: string;
}

const STATUS_LABEL: Record<MyCourse["status"], string> = {
  draft: "作成中",
  pending: "承認待ち",
  rejected: "差し戻し",
  active: "承認済み",
  archived: "アーカイブ",
};

/**
 * 社員向け: 自分が作った社内テストの一覧と、新しいテストの作成。
 */
export default function TrainingAuthorHomePage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const token = params.token;

  const [authorName, setAuthorName] = useState("");
  const [courses, setCourses] = useState<MyCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/training/authoring/me", { headers: { "x-author-token": token } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "読み込みに失敗しました。");
      } else {
        setAuthorName(data.name);
        setCourses(data.courses ?? []);
      }
      setLoading(false);
    })();
  }, [token]);

  async function createCourse() {
    setError(null);
    if (!name.trim()) {
      setError("テスト名を入力してください。");
      return;
    }
    setCreating(true);
    const res = await fetch("/api/training/authoring/courses", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-author-token": token },
      body: JSON.stringify({ name, description, targetAudience }),
    });
    const data = await res.json().catch(() => ({}));
    setCreating(false);
    if (!res.ok) {
      setError(data.error ?? "作成に失敗しました。");
      return;
    }
    router.push(`/training/author/${token}/course/${data.courseId}`);
  }

  if (loading) {
    return (
      <main className="page">
        <p className="text-muted">読み込み中...</p>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="page-header">
        <h1>社内テストの作成</h1>
        <p>
          {authorName}さんの作問ページです。このページのURLはあなた専用です。ブックマークしておいてください。
        </p>
      </div>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}>
          {error}
        </div>
      )}

      <div className="section">
        <div className="section-title">
          <span className="dot" />
          <h2>作成したテスト</h2>
        </div>
        {courses.length === 0 ? (
          <div className="card">
            <p className="text-muted" style={{ marginBottom: 0 }}>
              まだありません。下から新しいテストを作成してください。
            </p>
          </div>
        ) : (
          <div className="card" style={{ padding: 0 }}>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>テスト名</th>
                    <th>状態</th>
                    <th>作成日</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {courses.map((c) => (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 500 }}>{c.name}</td>
                      <td>
                        {STATUS_LABEL[c.status]}
                        {c.status === "rejected" && c.review_comment && (
                          <div className="text-muted" style={{ fontSize: 12 }}>
                            {c.review_comment}
                          </div>
                        )}
                      </td>
                      <td className="text-muted">{new Date(c.created_at).toLocaleDateString("ja-JP")}</td>
                      <td style={{ textAlign: "right" }}>
                        <a href={`/training/author/${token}/course/${c.id}`} className="btn btn-outline btn-sm">
                          開く
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div className="section">
        <div className="section-title">
          <span className="dot" />
          <h2>新しいテストを作る</h2>
        </div>
        <div className="card">
          <div className="field">
            <label>テスト名</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例: 住宅ローン控除の基礎知識テスト" />
          </div>
          <div className="field">
            <label>目的・説明(任意)</label>
            <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="field">
            <label>受験対象者(任意)</label>
            <input value={targetAudience} onChange={(e) => setTargetAudience(e.target.value)} placeholder="例: 入社1年目のFP" />
          </div>
          <button className="btn btn-primary" onClick={createCourse} disabled={creating}>
            {creating ? "作成中..." : "作成して資料の登録へ進む"}
          </button>
        </div>
      </div>
    </main>
  );
}
