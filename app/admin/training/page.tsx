"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

interface Course {
  id: string;
  name: string;
  description: string | null;
  status: string;
  created_at: string;
  due_date?: string | null;
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
  invited_by: string | null;
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

/** "2026-11-30" や ISO日時 → "11月30日"(日本時間) */
function formatJpDate(value: string): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(value + "T00:00:00+09:00") : new Date(value);
  return date.toLocaleDateString("ja-JP", { month: "long", day: "numeric", timeZone: "Asia/Tokyo" });
}

/** 今日(日本時間)から見た日数。過去なら負の値 */
function daysFromToday(value: string): number {
  const todayJst = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const target = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value
    : new Date(new Date(value).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  return Math.round((Date.parse(target) - Date.parse(todayJst)) / 86400000);
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
  const [showUninvited, setShowUninvited] = useState(false);
  const [dueDateInput, setDueDateInput] = useState("");
  const [savingDueDate, setSavingDueDate] = useState(false);
  const [dueDateMessage, setDueDateMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [selectedUninvitedIds, setSelectedUninvitedIds] = useState<string[]>([]);
  const [bulkInviting, setBulkInviting] = useState(false);
  const [noticeCopied, setNoticeCopied] = useState(false);

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
  const dueDate = selectedCourse?.due_date ?? null;

  useEffect(() => {
    setDueDateInput(selectedCourse?.due_date ?? "");
    setDueDateMessage(null);
    setSelectedUninvitedIds([]);
  }, [selectedCourse?.id, selectedCourse?.due_date]);

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

  const enrolledRows = useMemo(() => rows.filter((r) => r.enrollment), [rows]);
  const uninvitedRows = useMemo(() => rows.filter((r) => !r.enrollment), [rows]);
  const passedCount = enrolledRows.filter((r) => r.passed).length;
  const failedCount = enrolledRows.filter((r) => !r.passed && r.attemptCount > 0).length;
  const notAttemptedCount = enrolledRows.filter(
    (r) => !r.passed && r.attemptCount === 0
  ).length;
  const notPassedRows = enrolledRows.filter((r) => !r.passed);

  async function saveDueDate(value: string | null) {
    const token = await getAccessToken();
    if (!token || !selectedCourseId) return;
    setSavingDueDate(true);
    setDueDateMessage(null);
    const res = await fetch(`/api/admin/training/courses/${selectedCourseId}/due-date`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({ dueDate: value }),
    });
    setSavingDueDate(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setDueDateMessage({ ok: false, text: body.error || "期限の保存に失敗しました。" });
      return;
    }
    setDueDateMessage({ ok: true, text: value ? "期限を保存しました。" : "期限をなしにしました。" });
    await load();
  }

  /** まだ合格していない受講対象者へ、LINE WORKS やメールに貼る案内文 */
  function buildNoticeText(): string {
    const lines = [
      `【社内テストのお願い】${selectedCourse?.name ?? ""}`,
      dueDate
        ? `${formatJpDate(dueDate)}までに受験し、合格をお願いします。`
        : "お手すきの際に受験をお願いします。",
      "合格するまで何度でも受験できます(1回15〜20分ほど)。下のリンクは各自専用です。",
    ];
    for (const r of notPassedRows) {
      lines.push("", `▼${r.employee.name}さん`, origin + "/training/" + r.enrollment!.invite_token);
    }
    return lines.join("\n");
  }

  async function copyNoticeText() {
    const text = buildNoticeText();
    try {
      await navigator.clipboard.writeText(text);
      setNoticeCopied(true);
      setTimeout(() => setNoticeCopied(false), 2000);
    } catch {
      prompt("この内容をコピーしてください:", text);
    }
  }

  function toggleUninvited(employeeId: string) {
    setSelectedUninvitedIds((prev) =>
      prev.includes(employeeId) ? prev.filter((id) => id !== employeeId) : [...prev, employeeId]
    );
  }

  async function bulkInvite() {
    const token = await getAccessToken();
    if (!token || !selectedCourseId || selectedUninvitedIds.length === 0) return;
    setBulkInviting(true);
    const res = await fetch("/api/admin/training/bulk-invite", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({ courseId: selectedCourseId, employeeIds: selectedUninvitedIds }),
    });
    setBulkInviting(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.error || "招待の発行に失敗しました。");
      return;
    }
    setSelectedUninvitedIds([]);
    await load();
  }

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
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          <a href="/admin/training/authoring" className="btn btn-outline btn-sm">
            社員が作ったテスト
          </a>
          <a href="/admin/training/rules" className="btn btn-outline btn-sm">
            作問ルール
          </a>
        </div>
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
              <p style={{ fontWeight: 600, marginBottom: 4 }}>受験期限</p>
              <p className="text-muted" style={{ marginBottom: 12, fontSize: 13 }}>
                期限を決めておくと、下の「案内文をコピー」に期限が入ります。
                {dueDate &&
                  (daysFromToday(dueDate) >= 0
                    ? ` 現在の期限: ${formatJpDate(dueDate)}(あと${daysFromToday(dueDate)}日)`
                    : ` 現在の期限: ${formatJpDate(dueDate)}(${-daysFromToday(dueDate)}日過ぎています)`)}
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <input
                  type="date"
                  value={dueDateInput}
                  onChange={(e) => setDueDateInput(e.target.value)}
                  style={{ maxWidth: 200 }}
                />
                <button
                  onClick={() => saveDueDate(dueDateInput || null)}
                  disabled={savingDueDate || !dueDateInput}
                  className="btn btn-primary btn-sm"
                >
                  {savingDueDate ? "保存中..." : "期限を保存"}
                </button>
                {dueDate && (
                  <button
                    onClick={() => saveDueDate(null)}
                    disabled={savingDueDate}
                    className="btn btn-outline btn-sm"
                  >
                    期限なしにする
                  </button>
                )}
              </div>
              {dueDateMessage && (
                <p
                  style={{
                    fontSize: 13,
                    marginTop: 8,
                    marginBottom: 0,
                    color: dueDateMessage.ok ? "var(--color-success)" : "var(--color-error)",
                  }}
                >
                  {dueDateMessage.text}
                </p>
              )}
            </div>
          </div>

          <div className="section">
            <div className="card">
              <p style={{ fontWeight: 600, marginBottom: 4 }}>自己登録用リンク</p>
              <p className="text-muted" style={{ marginBottom: 12, fontSize: 13 }}>
                このリンクを対象者に共有すると、個別に招待を発行しなくても本人が氏名・メールアドレス(@alpha-fp.com または @peoples-connect.comのみ)を登録して自分で受験を開始できます。
              </p>
              <button onClick={copyRegisterLink} className="btn btn-outline btn-sm">
                {copiedRegisterLink ? "コピーしました" : "自己登録リンクをコピー"}
              </button>
            </div>
          </div>

          {rows.length === 0 ? (
            <div className="card">
              <p className="text-muted" style={{ marginBottom: 0 }}>
                社員が登録されていません。
              </p>
            </div>
          ) : (
            <>
              <div className="section" style={{ marginBottom: 0 }}>
                <div className="section-title">
                  <span className="dot" />
                  <h2>受講対象者</h2>
                </div>

                {enrolledRows.length === 0 ? (
                  <div className="card">
                    <p className="text-muted" style={{ marginBottom: 0 }}>
                      まだ受講対象者がいません。下の「未招待の社員」から招待を発行するか、自己登録用リンクを共有してください。
                    </p>
                  </div>
                ) : (
                  <>
                    <p
                      className="text-muted"
                      style={{ marginTop: 0, marginBottom: 12, fontSize: 13 }}
                    >
                      受講対象者 {enrolledRows.length}名 ── 🟢 合格 {passedCount} / ⚪ 未受験{" "}
                      {notAttemptedCount} / 🔴 不合格 {failedCount}
                    </p>
                    {notPassedRows.length > 0 && (
                      <div className="card" style={{ background: "#f7f8fa", padding: 16 }}>
                        <p style={{ fontWeight: 600, marginTop: 0, marginBottom: 4 }}>
                          まだ合格していない{notPassedRows.length}名への案内文
                        </p>
                        <p className="text-muted" style={{ fontSize: 13, marginBottom: 12 }}>
                          コピーして、LINE WORKS やメールに貼り付けて送ってください。各自専用の受験リンク
                          {dueDate ? "と期限" : ""}が入っています。
                          {!dueDate && "期限を決めると、案内文にも期限が入ります。"}
                        </p>
                        <button onClick={copyNoticeText} className="btn btn-primary btn-sm">
                          {noticeCopied ? "コピーしました" : "案内文をコピー"}
                        </button>
                      </div>
                    )}
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
                              <th>招待日</th>
                              <th></th>
                            </tr>
                          </thead>
                          <tbody>
                            {enrolledRows.map(
                              ({ employee, enrollment, attemptCount, passed, latest }) => (
                                <tr key={employee.id}>
                                  <td style={{ fontWeight: 500 }}>{employee.name}</td>
                                  <td className="text-muted">{employee.department || "-"}</td>
                                  <td>
                                    {passed ? (
                                      <span
                                        style={{ color: "var(--color-success, #1a7f37)" }}
                                      >
                                        🟢 合格
                                      </span>
                                    ) : attemptCount > 0 ? (
                                      <span style={{ color: "var(--color-error)" }}>
                                        🔴 不合格
                                      </span>
                                    ) : (
                                      <span className="text-muted">⚪ 未受験</span>
                                    )}
                                  </td>
                                  <td className="text-muted">{attemptCount}回</td>
                                  <td className="text-muted">
                                    {latest ? `${latest.score} / ${latest.total}` : "-"}
                                  </td>
                                  <td className="text-muted" style={{ whiteSpace: "nowrap" }}>
                                    {formatJpDate(enrollment!.created_at)}
                                    {!passed && attemptCount === 0 && (
                                      <span
                                        style={{
                                          marginLeft: 6,
                                          color:
                                            -daysFromToday(enrollment!.created_at) >= 3
                                              ? "var(--color-error)"
                                              : undefined,
                                        }}
                                      >
                                        ({-daysFromToday(enrollment!.created_at)}日経過)
                                      </span>
                                    )}
                                  </td>
                                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                                    <button
                                      onClick={() =>
                                        copyLink(employee.id, enrollment!.invite_token)
                                      }
                                      className="btn btn-outline btn-sm"
                                    >
                                      {copiedId === employee.id
                                        ? "コピーしました"
                                        : "リンクをコピー"}
                                    </button>
                                  </td>
                                </tr>
                              )
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="section" style={{ marginBottom: 0, marginTop: 24 }}>
                <button
                  onClick={() => setShowUninvited((v) => !v)}
                  className="btn btn-outline btn-sm"
                  disabled={uninvitedRows.length === 0}
                >
                  {uninvitedRows.length === 0
                    ? "未招待の社員はいません"
                    : `${showUninvited ? "▼" : "▶"} 未招待の社員 (${
                        uninvitedRows.length
                      }名) を${showUninvited ? "隠す" : "表示"}`}
                </button>

                {showUninvited && uninvitedRows.length > 0 && (
                  <div className="card" style={{ padding: 0, marginTop: 12 }}>
                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        flexWrap: "wrap",
                        alignItems: "center",
                        padding: "16px 20px 4px",
                      }}
                    >
                      <span className="text-muted" style={{ fontSize: 13 }}>
                        受けてほしい社員にチェックを入れて、まとめて招待できます。
                      </span>
                      <button
                        onClick={() => setSelectedUninvitedIds(uninvitedRows.map((r) => r.employee.id))}
                        className="btn btn-outline btn-sm"
                      >
                        全員を選択
                      </button>
                      <button
                        onClick={() => setSelectedUninvitedIds([])}
                        disabled={selectedUninvitedIds.length === 0}
                        className="btn btn-outline btn-sm"
                      >
                        選択解除
                      </button>
                      <button
                        onClick={bulkInvite}
                        disabled={bulkInviting || selectedUninvitedIds.length === 0}
                        className="btn btn-primary btn-sm"
                      >
                        {bulkInviting
                          ? "招待中..."
                          : `選択した社員を招待(${selectedUninvitedIds.length}名)`}
                      </button>
                    </div>
                    <div className="table-wrap">
                      <table className="table">
                        <thead>
                          <tr>
                            <th style={{ width: 32 }}></th>
                            <th>氏名</th>
                            <th>部署</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {uninvitedRows.map(({ employee }) => (
                            <tr key={employee.id}>
                              <td>
                                <input
                                  type="checkbox"
                                  checked={selectedUninvitedIds.includes(employee.id)}
                                  onChange={() => toggleUninvited(employee.id)}
                                  aria-label={`${employee.name}を選択`}
                                />
                              </td>
                              <td style={{ fontWeight: 500 }}>{employee.name}</td>
                              <td className="text-muted">{employee.department || "-"}</td>
                              <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                                <button
                                  onClick={() => issueInvite(employee.id)}
                                  disabled={issuingId === employee.id}
                                  className="btn btn-outline btn-sm"
                                >
                                  {issuingId === employee.id ? "発行中..." : "招待を発行"}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}
    </main>
  );
}
