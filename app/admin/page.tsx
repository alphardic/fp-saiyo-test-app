"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

interface SessionRow {
  id: string;
  status: string;
  submitted_at: string | null;
  candidate_id: string;
  candidates: { name: string; email: string } | null;
}

interface CandidateRow {
  id: string;
  name: string;
  email: string;
  invite_token: string;
  created_at: string;
  age: number | null;
  fp_experience: string | null;
  fp_license: string | null;
  fp_affiliation: string | null;
}

interface LogicCandidateRow {
  id: string;
  main_candidate_id: string | null;
  invite_token: string;
}

interface LogicSessionRow {
  id: string;
  candidate_id: string;
  status: string;
}

const FP_EXPERIENCE_OPTIONS = ["未経験", "経験者"];
const FP_LICENSE_OPTIONS = ["なし", "3級", "2級", "1級", "AFP", "CFP"];
const FP_AFFILIATION_OPTIONS = ["非FP", "他社FP", "当社FP"];

const STATUS_LABEL: Record<string, string> = {
  not_started: "未受験",
  in_progress: "受験中",
  submitted: "採点待ち",
  graded: "採点済み",
};

function StatusBadge({ status }: { status: string }) {
  const label = STATUS_LABEL[status] ?? status;
  let cls = "badge badge-muted";
  if (status === "in_progress" || status === "submitted") cls = "badge badge-progress";
  if (status === "graded") cls = "badge badge-done";
  return <span className={cls}>{label}</span>;
}

const LOGIC_STATUS_LABEL: Record<string, string> = {
  not_started: "未受験",
  in_progress: "受験中",
  completed: "完了",
};

function LogicStatusBadge({ status }: { status: string }) {
  const label = LOGIC_STATUS_LABEL[status] ?? status;
  let cls = "badge badge-muted";
  if (status === "in_progress") cls = "badge badge-progress";
  if (status === "completed") cls = "badge badge-done";
  return <span className={cls}>{label}</span>;
}

/**
 * 管理者向けダッシュボード。
 * データ取得・候補者登録はサーバー側API(/api/admin/*)経由で行う
 * (RLS越しの直接アクセスがSupabase側のJWT検証の問題で不安定なため)。
 */
export default function AdminDashboardPage() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [candidates, setCandidates] = useState<CandidateRow[]>([]);
  const [logicCandidates, setLogicCandidates] = useState<LogicCandidateRow[]>([]);
  const [logicSessions, setLogicSessions] = useState<LogicSessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [age, setAge] = useState("");
  const [fpExperience, setFpExperience] = useState("");
  const [fpLicense, setFpLicense] = useState("");
  const [fpAffiliation, setFpAffiliation] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [origin, setOrigin] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedLogicId, setCopiedLogicId] = useState<string | null>(null);
  const [issuingLogicId, setIssuingLogicId] = useState<string | null>(null);
  const [gradingId, setGradingId] = useState<string | null>(null);
  const [gradeError, setGradeError] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showInviteList, setShowInviteList] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);

  const [myRole, setMyRole] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAge, setEditAge] = useState("");
  const [editFpExperience, setEditFpExperience] = useState("");
  const [editFpLicense, setEditFpLicense] = useState("");
  const [editFpAffiliation, setEditFpAffiliation] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
    load();
    loadMyRole();
  }, []);

  async function loadMyRole() {
    const token = await getAccessToken();
    if (!token) return;
    const res = await fetch("/api/admin/me", {
      headers: { Authorization: "Bearer " + token },
    });
    if (!res.ok) return;
    const body = await res.json();
    setMyRole(body.role ?? null);
  }

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
    const res = await fetch("/api/admin/dashboard", {
      headers: { Authorization: "Bearer " + token },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setAuthError(
        body.error ||
          "データの取得に失敗しました(管理者権限が付与されているか確認してください)。"
      );
      setLoading(false);
      return;
    }
    const body = await res.json();
    setCandidates(body.candidates ?? []);
    setSessions(body.sessions ?? []);
    setLogicCandidates(body.logicCandidates ?? []);
    setLogicSessions(body.logicSessions ?? []);
    setLoading(false);
  }

  async function handleAddCandidate() {
    setAddError(null);
    if (!name || !email) {
      setAddError("名前とメールアドレスを入力してください。");
      return;
    }
    const token = await getAccessToken();
    if (!token) {
      setAddError("ログインが必要です。");
      return;
    }
    setAdding(true);
    const res = await fetch("/api/admin/candidates", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({
        name,
        email,
        age: age === "" ? null : Number(age),
        fpExperience: fpExperience || null,
        fpLicense: fpLicense || null,
        fpAffiliation: fpAffiliation || null,
      }),
    });
    setAdding(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setAddError(body.error || "登録に失敗しました。");
      return;
    }
    setName("");
    setEmail("");
    setAge("");
    setFpExperience("");
    setFpLicense("");
    setFpAffiliation("");
    await load();
  }

  async function gradeSession(sessionId: string) {
    setGradeError(null);
    const token = await getAccessToken();
    if (!token) {
      setGradeError("ログインが必要です。");
      return;
    }
    setGradingId(sessionId);
    const res = await fetch(`/api/admin/sessions/${sessionId}/grade`, {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
    });
    setGradingId(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setGradeError(body.error || "採点に失敗しました。");
      return;
    }
    await load();
  }

  function toggleSelect(sessionId: string) {
    setSelectedIds((cur) =>
      cur.includes(sessionId) ? cur.filter((x) => x !== sessionId) : [...cur, sessionId]
    );
    setShowInviteList(false);
  }

  function selectAllNotStarted() {
    setSelectedIds(sessions.filter((s) => s.status === "not_started").map((s) => s.id));
    setShowInviteList(false);
  }

  function clearSelection() {
    setSelectedIds([]);
    setShowInviteList(false);
  }

  const canCompare =
    selectedIds.length >= 2 &&
    selectedIds.every((id) => sessions.find((s) => s.id === id)?.status === "graded");

  function goToCompare() {
    if (!canCompare) return;
    window.location.href = "/admin/compare?ids=" + selectedIds.join(",");
  }

  function logicCandidateFor(mainCandidateId: string) {
    return logicCandidates.find((lc) => lc.main_candidate_id === mainCandidateId);
  }

  function logicSessionFor(logicCandidateId: string) {
    return logicSessions.find((ls) => ls.candidate_id === logicCandidateId);
  }

  function buildInviteListText(): string {
    const blocks: string[] = [];
    for (const id of selectedIds) {
      const s = sessions.find((x) => x.id === id);
      if (!s || !s.candidates) continue;
      const cand = candidates.find((c) => c.email === s.candidates!.email);
      if (!cand) continue;
      const mainLink = origin + "/exam/" + cand.invite_token;
      let block = `${cand.name} <${cand.email}>\n【金融リテラシーチェックテスト】\n${mainLink}`;
      const lc = logicCandidateFor(cand.id);
      if (lc) {
        const logicLink = origin + "/logic-exam/" + lc.invite_token;
        block += `\n【ロジカルシンキング適性テスト】\n${logicLink}`;
      }
      blocks.push(block);
    }
    return blocks.join("\n\n");
  }

  async function copyInviteList() {
    const text = buildInviteListText();
    try {
      await navigator.clipboard.writeText(text);
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 2000);
    } catch {
      prompt("この内容をコピーしてください:", text);
    }
  }

  function startEdit(c: CandidateRow) {
    setEditingId(c.id);
    setEditAge(c.age !== null ? String(c.age) : "");
    setEditFpExperience(c.fp_experience ?? "");
    setEditFpLicense(c.fp_license ?? "");
    setEditFpAffiliation(c.fp_affiliation ?? "");
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(id: string) {
    const token = await getAccessToken();
    if (!token) return;
    setSavingEdit(true);
    const res = await fetch(`/api/admin/candidates/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({
        age: editAge === "" ? null : Number(editAge),
        fpExperience: editFpExperience || null,
        fpLicense: editFpLicense || null,
        fpAffiliation: editFpAffiliation || null,
      }),
    });
    setSavingEdit(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.error || "更新に失敗しました。");
      return;
    }
    setEditingId(null);
    await load();
  }

  async function copyLink(id: string, token: string) {
    const link = origin + "/exam/" + token;
    const text = `【金融リテラシーチェックテスト】\n${link}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 2000);
    } catch {
      prompt("このリンクをコピーしてください:", text);
    }
  }

  async function copyLogicLink(id: string, token: string) {
    const link = origin + "/logic-exam/" + token;
    const text = `【ロジカルシンキング適性テスト】\n${link}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedLogicId(id);
      setTimeout(() => setCopiedLogicId((cur) => (cur === id ? null : cur)), 2000);
    } catch {
      prompt("このリンクをコピーしてください:", text);
    }
  }

  async function issueLogicInvite(candidateId: string) {
    const token = await getAccessToken();
    if (!token) return;
    setIssuingLogicId(candidateId);
    const res = await fetch(`/api/admin/candidates/${candidateId}/logic-invite`, {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
    });
    setIssuingLogicId(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.error || "発行に失敗しました。");
      return;
    }
    await load();
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1>管理ダッシュボード</h1>
            <p>候補者の招待と受験状況を管理します。</p>
          </div>
          {myRole === "super_admin" && (
            <a href="/admin/admins" className="btn btn-outline btn-sm">
              管理者管理
            </a>
          )}
        </div>
      </div>

      <div className="section">
        <div className="section-title">
          <span className="dot" />
          <h2>候補者の招待</h2>
        </div>
        <div className="card">
          <div className="form-row" style={{ marginBottom: 16 }}>
            <div className="field">
              <label htmlFor="cand-name">氏名</label>
              <input
                id="cand-name"
                type="text"
                placeholder="山田 太郎"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="cand-email">メールアドレス</label>
              <input
                id="cand-email"
                type="email"
                placeholder="taro@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>
          <div className="form-row" style={{ marginBottom: 16 }}>
            <div className="field">
              <label htmlFor="cand-age">年齢(任意)</label>
              <input
                id="cand-age"
                type="number"
                min={0}
                placeholder="30"
                value={age}
                onChange={(e) => setAge(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="cand-fp-exp">金融・FP実務経験(任意)</label>
              <select
                id="cand-fp-exp"
                value={fpExperience}
                onChange={(e) => setFpExperience(e.target.value)}
              >
                <option value="">未選択</option>
                {FP_EXPERIENCE_OPTIONS.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="cand-fp-license">FP資格(任意)</label>
              <select
                id="cand-fp-license"
                value={fpLicense}
                onChange={(e) => setFpLicense(e.target.value)}
              >
                <option value="">未選択</option>
                {FP_LICENSE_OPTIONS.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="cand-fp-affiliation">区分(任意)</label>
              <select
                id="cand-fp-affiliation"
                value={fpAffiliation}
                onChange={(e) => setFpAffiliation(e.target.value)}
              >
                <option value="">未選択</option>
                {FP_AFFILIATION_OPTIONS.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <button onClick={handleAddCandidate} disabled={adding} className="btn btn-primary">
              {adding ? "登録中..." : "候補者を追加"}
            </button>
          </div>
          <p className="text-muted" style={{ fontSize: 12, marginBottom: 0 }}>
            ※ 登録すると、金融リテラシーチェックテストとロジカルシンキング適性テスト、両方の招待リンクが同時に発行されます。
          </p>
          {addError && <div className="alert alert-error" style={{ marginTop: 12, marginBottom: 0 }}>{addError}</div>}
          <div className="table-wrap" style={{ marginTop: 16 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>氏名</th>
                  <th>メール</th>
                  <th>属性</th>
                  <th>受験リンク</th>
                  <th>ロジカルテスト</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((c) =>
                  editingId === c.id ? (
                    <tr key={c.id}>
                      <td>{c.name}</td>
                      <td className="text-muted">{c.email}</td>
                      <td colSpan={3}>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                          <input
                            type="number"
                            min={0}
                            placeholder="年齢"
                            value={editAge}
                            onChange={(e) => setEditAge(e.target.value)}
                            style={{ width: 70 }}
                          />
                          <select
                            value={editFpExperience}
                            onChange={(e) => setEditFpExperience(e.target.value)}
                          >
                            <option value="">実務経験未選択</option>
                            {FP_EXPERIENCE_OPTIONS.map((v) => (
                              <option key={v} value={v}>
                                {v}
                              </option>
                            ))}
                          </select>
                          <select
                            value={editFpLicense}
                            onChange={(e) => setEditFpLicense(e.target.value)}
                          >
                            <option value="">資格未選択</option>
                            {FP_LICENSE_OPTIONS.map((v) => (
                              <option key={v} value={v}>
                                {v}
                              </option>
                            ))}
                          </select>
                          <select
                            value={editFpAffiliation}
                            onChange={(e) => setEditFpAffiliation(e.target.value)}
                          >
                            <option value="">区分未選択</option>
                            {FP_AFFILIATION_OPTIONS.map((v) => (
                              <option key={v} value={v}>
                                {v}
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={() => saveEdit(c.id)}
                            disabled={savingEdit}
                            className="btn btn-primary btn-sm"
                          >
                            {savingEdit ? "保存中..." : "保存"}
                          </button>
                          <button onClick={cancelEdit} className="btn btn-outline btn-sm">
                            キャンセル
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={c.id}>
                      <td>{c.name}</td>
                      <td className="text-muted">{c.email}</td>
                      <td className="text-muted" style={{ fontSize: 12 }}>
                        {[
                          c.age !== null ? `${c.age}歳` : null,
                          c.fp_affiliation,
                          c.fp_license,
                          c.fp_experience,
                        ]
                          .filter(Boolean)
                          .join(" / ") || "-"}{" "}
                        <button
                          onClick={() => startEdit(c)}
                          className="btn btn-outline btn-sm"
                          style={{ marginLeft: 6 }}
                        >
                          編集
                        </button>
                      </td>
                      <td>
                        <button
                          onClick={() => copyLink(c.id, c.invite_token)}
                          className="btn btn-outline btn-sm"
                        >
                          {copiedId === c.id ? "コピーしました" : "リンクをコピー"}
                        </button>
                      </td>
                      <td>
                        {(() => {
                          const lc = logicCandidateFor(c.id);
                          if (!lc) {
                            return (
                              <button
                                onClick={() => issueLogicInvite(c.id)}
                                disabled={issuingLogicId === c.id}
                                className="btn btn-outline btn-sm"
                              >
                                {issuingLogicId === c.id ? "発行中..." : "招待を発行"}
                              </button>
                            );
                          }
                          const ls = logicSessionFor(lc.id);
                          const status = ls?.status ?? "not_started";
                          return (
                            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                              <LogicStatusBadge status={status} />
                              <button
                                onClick={() => copyLogicLink(c.id, lc.invite_token)}
                                className="btn btn-outline btn-sm"
                              >
                                {copiedLogicId === c.id ? "コピーしました" : "リンクをコピー"}
                              </button>
                              {status === "completed" && ls && (
                                <a
                                  href={"/admin/logic-test/report/" + ls.id}
                                  className="btn btn-gold btn-sm"
                                >
                                  レポート
                                </a>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
            {candidates.length === 0 && (
              <div className="table-empty">まだ候補者が登録されていません。</div>
            )}
          </div>
        </div>
      </div>

      <div className="section" style={{ marginBottom: 0 }}>
        <div className="section-title">
          <span className="dot" />
          <h2>受験状況一覧</h2>
        </div>
        <div className="card">
          {gradeError && <div className="alert alert-error">{gradeError}</div>}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 8,
              marginBottom: 12,
            }}
          >
            <span className="text-muted" style={{ fontSize: 13 }}>
              候補者にチェックを入れると、比較(採点済み2名以上)や招待リンクの一括表示ができます。
            </span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={selectAllNotStarted} className="btn btn-outline btn-sm">
                未受験の全員を選択
              </button>
              <button
                onClick={clearSelection}
                disabled={selectedIds.length === 0}
                className="btn btn-outline btn-sm"
              >
                選択解除
              </button>
              <button
                onClick={() => setShowInviteList(true)}
                disabled={selectedIds.length === 0}
                className="btn btn-outline btn-sm"
              >
                招待リンクを一覧表示
              </button>
              <button onClick={goToCompare} disabled={!canCompare} className="btn btn-primary btn-sm">
                選択した{selectedIds.length}名を比較する
              </button>
            </div>
          </div>

          {showInviteList && (
            <div
              className="card"
              style={{ background: "#f7f8fa", marginBottom: 16, padding: 16 }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 600 }}>
                  招待リンク一覧({selectedIds.length}名)
                </span>
                <button onClick={copyInviteList} className="btn btn-outline btn-sm">
                  {inviteCopied ? "コピーしました" : "全てコピー"}
                </button>
              </div>
              <textarea
                readOnly
                value={buildInviteListText()}
                rows={Math.max(4, selectedIds.length * 5)}
                style={{
                  width: "100%",
                  fontFamily: "monospace",
                  fontSize: 12,
                  padding: 8,
                  boxSizing: "border-box",
                }}
              />
            </div>
          )}

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th></th>
                  <th>候補者</th>
                  <th>状態</th>
                  <th>提出日時</th>
                  <th>レポート</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(s.id)}
                        onChange={() => toggleSelect(s.id)}
                      />
                    </td>
                    <td>{s.candidates?.name ?? "-"}</td>
                    <td>
                      <StatusBadge status={s.status} />
                    </td>
                    <td className="text-muted">{s.submitted_at ?? "-"}</td>
                    <td>
                      {s.status === "graded" ? (
                        <a href={"/admin/report/" + s.id}>詳細を見る</a>
                      ) : s.status === "submitted" ? (
                        <button
                          onClick={() => gradeSession(s.id)}
                          disabled={gradingId === s.id}
                          className="btn btn-outline btn-sm"
                        >
                          {gradingId === s.id ? "採点中..." : "採点する"}
                        </button>
                      ) : (
                        <span className="text-muted">未受験</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {sessions.length === 0 && (
              <div className="table-empty">まだ受験データがありません。</div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}