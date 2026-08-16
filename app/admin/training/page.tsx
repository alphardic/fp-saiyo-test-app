"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

interface Course {
  id: string;
  name: string;
  description: string | null;
  status: string;
  created_at: string;
}

interface Employee {
  id: string;
  name: string;
  department: string | null;
}

interface Enrollment {
  id: string;
  course_id: string;
  employee_id: string;
  invite_token: string;
  created_at: string;
}

interface Attempt {
  id: string;
  enrollment_id: string;
  status: "in_progress" | "submitted";
  score: number | null;
  total: number | null;
  passed: boolean | null;
  submitted_at: string | null;
}

export default function TrainingAdminPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  const [issuingId, setIssuingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedRegisterLink, setCopiedRegisterLink] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
    load();
  }, []);

  async function getAccessToken(): Promise<string | null> {
    const { data } = await supabaseBrowser.auth.getSession();
    return data.session?.access_token ?? null;
  }

  async function load() {
    const token = await getAccessToken();
    if (!token) {
      setAuthError("ログインが必要です。");
      setLoading(false);
      return;
    }
    const res = await fetch("/api/admin/training", {
      headers: { Authorization: "Bearer " + token },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setAuthError(body.error || "データの取得に失敗しました。");
      setLoading(false);
      return;
    }
    const body = await res.json();
    setCourses(body.courses ?? []);
    setEmployees(body.employees ?? []);
    setEnrollments(body.enrollments ?? []);
    setAttempts(body.attempts ?? []);
    setSelectedCourseId((prev) => prev || body.courses?.[0]?.id || "");
    setLoading(false);
  }

  const selectedCourse = courses.find((c) => c.id === selectedCourseId) ?? null;

  const rows = useMemo(() => {
    return employees.map((e) => {
      const enrollment = enrollments.find(
        (en) => en.course_id === selectedCourseId && en.employee_id === e.id
      );
      const employeeAttempts = enrollment
        ? attempts
            .filter((a) => a.enrollment_id === enrollment.id && a.status === "submitted")
            .sort((a, b) => (b.submitted_at ?? "").localeCompare(a.submitted_at ?? ""))
        : [];
      const passed = employeeAttempts.some((a) => a.passed);
      const latest = employeeAttempts[0] ?? null;
      return { employee: e, enrollment, attemptCount: employeeAttempts.length, passed, latest };
    });
  }, [employees, enrollments, attempts, selectedCourseId]);

  async function copyLink(id: string, token: string) {
    const link = origin + "/training/" + token;
    try {
      await navigator.clipboard.writeText(link);
      setCopiedId(id);
      setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 2000);
    } catch {
      prompt("このリンクをコピーしてください:", link);
    }
  }

  async function copyRegisterLink() {
    if (!selectedCourseId) return;
    const link = origin + "/training/register/" + selectedCourseId;
    try {
      await navigator.clipboard.writeText(link);
      setCopiedRegisterLink(true);
      setTimeout(() => setCopiedRegisterLink(false), 2000);
    } catch {
      prompt("このリンクをコピーしてください:", link);
    }
  }

  async function issueInvite(employeeId: string) {
    const token = await getAccessToken();
    if (!token || !selectedCourseId) return;
    setIssuingId(employeeId);
    const res = await fetch(`/api/admin/employees/${employeeId}/training-invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({ courseId: selectedCourseId }),
    });
    setIssuingId(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.error || "発行に失敗しました。");
      return;
    }
    const body = (await res.json()) as { inviteToken?: string };
    await load();
    if (body.inviteToken) {
      await copyLink(employeeId, body.inviteToken);
    }
  }

  if (loading) {
    return (
      <main className="page">
        <p className="text-muted">読み込み中...</p>
      </main>
    );
  }

  if (authError) {
    return (
      <main className="page page-narrow">
        <div className="card">
          <div className="alert alert-error" style={{ marginBottom: 12 }}>
            {authError}
          </div>
          <a href="/admin/login" className="btn btn-outline">
            ログイン画面へ
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="page page-wide">
      <div className="page-header">
        <a href="/admin" className="text-muted" style={{ fontSize: 13 }}>
          ← ダッシュボードへ戻る
        </a>
        <h1 style={{ marginTop: 8 }}>分野別社内テスト</h1>
        <p>合格するまで何度でも受験できます。出題は知識ポイントごとに毎回パターンが変わります。</p>
      </div>

      {courses.length === 0 ? (
        <div className="card">
          <p className="text-muted" style={{ marginBottom: 0 }}>
            まだコースが登録されていません。
          </p>
        </div>
      ) : (
        <>
          <div className="section">
            <div className="field" style={{ maxWidth: 400 }}>
              <label htmlFor="course-select">コース</label>
              <select
                id="course-select"
                value={selectedCourseId}
                onChange={(e) => setSelectedCourseId(e.target.value)}
              >
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            {selectedCourse?.description && (
              <p className="text-muted" style={{ marginTop: 8 }}>
                {selectedCourse.description}
              </p>
            )}
          </div>

          <div className="section">
            <div className="card">
              <p style={{ fontWeight: 600, marginBottom: 4 }}>自己登録用リンク</p>
              <p className="text-muted" style={{ marginBottom: 12, fontSize: 13 }}>
                このリンクを対象者に共有すると、個別に招待を発行しなくても本人が氏名・メールアドレス(@alpha-fp.comのみ)を登録して自分で受験を開始できます。
              </p>
              <button onClick={copyRegisterLink} className="btn btn-outline btn-sm">
                {copiedRegisterLink ? "コピーしました" : "自己登録リンクをコピー"}
              </button>
            </div>
          </div>

          <div className="section" style={{ marginBottom: 0 }}>
            <div className="section-title">
              <span className="dot" />
              <h2>社員別の受講状況</h2>
            </div>
            <div className="card" style={{ padding: 0 }}>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>氏名</th>
                      <th>部署</th>
                      <th>合否</th>
                      <th>受験回数</th>
                      <th>直近スコア</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ employee, enrollment, attemptCount, passed, latest }) => (
                      <tr key={employee.id}>
                        <td style={{ fontWeight: 500 }}>{employee.name}</td>
                        <td className="text-muted">{employee.department || "-"}</td>
                        <td>
                          {!enrollment ? (
                            <span className="text-muted">未招待</span>
                          ) : passed ? (
                            <span style={{ color: "var(--color-success, #1a7f37)" }}>🟢 合格</span>
                          ) : attemptCount > 0 ? (
                            <span style={{ color: "var(--color-error)" }}>🔴 不合格</span>
                          ) : (
                            <span className="text-muted">⚪ 未受験</span>
                          )}
                        </td>
                        <td className="text-muted">{attemptCount}回</td>
                        <td className="text-muted">
                          {latest ? `${latest.score} / ${latest.total}` : "-"}
                        </td>
                        <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                          {!enrollment ? (
                            <button
                              onClick={() => issueInvite(employee.id)}
                              disabled={issuingId === employee.id}
                              className="btn btn-outline btn-sm"
                            >
                              {issuingId === employee.id ? "発行中..." : "招待を発行"}
                            </button>
                          ) : (
                            <button
                              onClick={() => copyLink(employee.id, enrollment.invite_token)}
                              className="btn btn-outline btn-sm"
                            >
                              {copiedId === employee.id ? "コピーしました" : "リンクをコピー"}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length === 0 && (
                  <div className="table-empty">社員が登録されていません。</div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
