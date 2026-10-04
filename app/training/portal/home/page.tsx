"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { portalHeaders, PORTAL_LOGIN_PATH } from "@/lib/trainingPortalClient";

type CourseStatus = "draft" | "pending" | "rejected" | "active" | "archived";

interface MyCourse {
  id: string;
  name: string;
  status: CourseStatus;
  review_comment: string | null;
  published_at: string | null;
  created_at: string;
  reviewRequested: number;
  reviewDone: number;
  enrolledCount: number;
}

interface ReviewRequest {
  courseId: string;
  name: string;
  courseStatus: CourseStatus;
  authorName: string | null;
  status: "requested" | "done";
  requestedAt: string;
}

const STATUS_LABEL: Record<CourseStatus, string> = {
  draft: "作成中",
  pending: "承認待ち",
  rejected: "差し戻し",
  active: "配布中",
  archived: "終了",
};

/**
 * 社員用ポータルのトップ: 自分が作ったテスト、確認を頼まれたテスト、新しいテストの作成。
 */
export default function TrainingPortalHomePage() {
  const router = useRouter();
  const [me, setMe] = useState<{ name: string; email: string | null } | null>(null);
  const [courses, setCourses] = useState<MyCourse[]>([]);
  const [reviewRequests, setReviewRequests] = useState<ReviewRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [creating, setCreating] = useState(false);

  const [showPassword, setShowPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const headers = await portalHeaders();
    if (!headers.Authorization) {
      router.replace(PORTAL_LOGIN_PATH);
      return;
    }
    const res = await fetch("/api/training/authoring/me", { headers });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      await supabaseBrowser.auth.signOut();
      router.replace(PORTAL_LOGIN_PATH);
      return;
    }
    if (!res.ok) {
      setError(data.error ?? "読み込みに失敗しました。");
    } else {
      setMe({ name: data.name, email: data.email });
      setCourses(data.courses ?? []);
      setReviewRequests(data.reviewRequests ?? []);
    }
    setLoading(false);
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  async function createCourse() {
    setError(null);
    if (!name.trim()) {
      setError("テスト名を入力してください。");
      return;
    }
    setCreating(true);
    const res = await fetch("/api/training/authoring/courses", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await portalHeaders()) },
      body: JSON.stringify({ name, description, targetAudience }),
    });
    const data = await res.json().catch(() => ({}));
    setCreating(false);
    if (!res.ok) {
      setError(data.error ?? "作成に失敗しました。");
      return;
    }
    router.push(`/training/portal/course/${data.courseId}?step=source`);
  }

  async function changePassword() {
    setPasswordMessage(null);
    if (newPassword.length < 8) {
      setPasswordMessage("パスワードは8文字以上にしてください。");
      return;
    }
    const { error: updateError } = await supabaseBrowser.auth.updateUser({ password: newPassword });
    setPasswordMessage(updateError ? "変更に失敗しました: " + updateError.message : "パスワードを変更しました。");
    if (!updateError) setNewPassword("");
  }

  async function logout() {
    await supabaseBrowser.auth.signOut();
    router.replace(PORTAL_LOGIN_PATH);
  }

  if (loading) {
    return (
      <main className="page">
        <p className="text-muted">読み込み中...</p>
      </main>
    );
  }

  const pendingReviews = reviewRequests.filter((r) => r.status === "requested");

  return (
    <main className="page">
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1>社内テスト 社員用ページ</h1>
          <p>
            {me?.name}さん({me?.email})
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <button className="btn btn-outline btn-sm" onClick={() => setShowPassword((v) => !v)}>
            パスワード変更
          </button>
          <button className="btn btn-outline btn-sm" onClick={logout}>
            ログアウト
          </button>
        </div>
      </div>

      {showPassword && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="field" style={{ maxWidth: 320 }}>
            <label>新しいパスワード(8文字以上)</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <button className="btn btn-primary btn-sm" onClick={changePassword}>
            変更する
          </button>
          {passwordMessage && <p style={{ fontSize: 13, marginBottom: 0 }}>{passwordMessage}</p>}
        </div>
      )}

      {error && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}>
          {error}
        </div>
      )}

      {reviewRequests.length > 0 && (
        <div className="section">
          <div className="section-title">
            <span className="dot" />
            <h2>確認を頼まれたテスト{pendingReviews.length > 0 ? `(未確認 ${pendingReviews.length}件)` : ""}</h2>
          </div>
          <div className="card" style={{ padding: 0 }}>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>テスト名</th>
                    <th>作成者</th>
                    <th>確認</th>
                    <th>依頼日</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {reviewRequests.map((r) => (
                    <tr key={r.courseId}>
                      <td style={{ fontWeight: 500 }}>{r.name}</td>
                      <td>{r.authorName ?? "-"}</td>
                      <td>{r.status === "done" ? "確認済み" : <strong>未確認</strong>}</td>
                      <td className="text-muted">{new Date(r.requestedAt).toLocaleDateString("ja-JP")}</td>
                      <td style={{ textAlign: "right" }}>
                        <a href={`/training/portal/course/${r.courseId}?step=questions`} className="btn btn-outline btn-sm">
                          確認する
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
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
                    <th>確認</th>
                    <th>受験者</th>
                    <th>作成日</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {courses.map((c) => (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 500 }}>{c.name}</td>
                      <td>{STATUS_LABEL[c.status]}</td>
                      <td className="text-muted">
                        {c.reviewRequested === 0 ? "-" : `${c.reviewDone} / ${c.reviewRequested}人 確認済み`}
                      </td>
                      <td className="text-muted">{c.status === "active" ? `${c.enrolledCount}人` : "-"}</td>
                      <td className="text-muted">{new Date(c.created_at).toLocaleDateString("ja-JP")}</td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        {c.status === "active" && (
                          <a
                            href={`/training/portal/course/${c.id}?step=results`}
                            className="btn btn-outline btn-sm"
                            style={{ marginRight: 4 }}
                          >
                            結果
                          </a>
                        )}
                        <a
                          href={`/training/portal/course/${c.id}${c.status === "active" ? "?step=publish" : ""}`}
                          className="btn btn-outline btn-sm"
                        >
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
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例: 住宅ローン控除の基礎知識テスト"
            />
          </div>
          <div className="field">
            <label>目的・説明(任意。受験者にも表示されます)</label>
            <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="field">
            <label>受験対象者(任意)</label>
            <input
              type="text"
              value={targetAudience}
              onChange={(e) => setTargetAudience(e.target.value)}
              placeholder="例: 入社1年目のFP"
            />
          </div>
          <button className="btn btn-primary" onClick={createCourse} disabled={creating}>
            {creating ? "作成中..." : "作成して資料の登録へ進む"}
          </button>
        </div>
      </div>
    </main>
  );
}
