"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { formatMbti } from "@/lib/mbti";

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
  invited_by: string | null;
  birthdate: string | null;
}

interface LogicCandidateRow {
  id: string;
  main_candidate_id: string | null;
  invite_token: string;
  mbti: string | null;
  created_at: string;
  invited_by: string | null;
}

interface LogicSessionRow {
  id: string;
  candidate_id: string;
  status: string;
}

const FP_EXPERIENCE_OPTIONS = ["未経験", "経験者"];
const FP_LICENSE_OPTIONS = ["なし", "3級", "2級", "1級", "AFP", "CFP"];
const FP_AFFILIATION_OPTIONS = ["非FP", "他社FP", "当社FP"];

const MAIN_STATUS_DOT: Record<string, string> = {
  not_started: "⚪",
  in_progress: "🟡",
  submitted: "🟠",
  graded: "🟢",
};
const MAIN_STATUS_TEXT: Record<string, string> = {
  not_started: "未受験",
  in_progress: "受験中",
  submitted: "採点待ち",
  graded: "採点済",
};

const LOGIC_STATUS_DOT: Record<string, string> = {
  not_issued: "⚫",
  not_started: "⚪",
  in_progress: "🟡",
  completed: "🟢",
};
const LOGIC_STATUS_TEXT: Record<string, string> = {
  not_issued: "未発行",
  not_started: "未受験",
  in_progress: "受験中",
  completed: "採点済",
};

function CompactStatus({ dot, text }: { dot: string; text: string }) {
  return (
    <span style={{ fontSize: 13, whiteSpace: "nowrap" }}>
      {dot} {text}
    </span>
  );
}

function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
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
  const [birthdate, setBirthdate] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [origin, setOrigin] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedLogicId, setCopiedLogicId] = useState<string | null>(null);
  const [issuingLogicId, setIssuingLogicId] = useState<string | null>(null);
  const [gradingId, setGradingId] = useState<string | null>(null);
  const [gradeError, setGradeError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showInviteList, setShowInviteList] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);

  const [myRole, setMyRole] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editAge, setEditAge] = useState("");
  const [editFpExperience, setEditFpExperience] = useState("");
  const [editFpLicense, setEditFpLicense] = useState("");
  const [editFpAffiliation, setEditFpAffiliation] = useState("");
  const [editBirthdate, setEditBirthdate] = useState("");
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
    if (!birthdate) {
      setAddError("生年月日を入力してください(占いの計算に使用します)。");
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
        birthdate: birthdate || null,
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
    setBirthdate("");
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

  function sessionFor(candidateId: string) {
    return sessions.find((s) => s.candidate_id === candidateId);
  }

  function toggleSelect(candidateId: string) {
    setSelectedIds((cur) =>
      cur.includes(candidateId) ? cur.filter((x) => x !== candidateId) : [...cur, candidateId]
    );
    setShowInviteList(false);
  }

  function selectAllNotStarted() {
    setSelectedIds(
      candidates
        .filter((c) => (sessionFor(c.id)?.status ?? "not_started") === "not_started")
        .map((c) => c.id)
    );
    setShowInviteList(false);
  }

  function clearSelection() {
    setSelectedIds([]);
    setShowInviteList(false);
  }

  const canCompare =
    selectedIds.length >= 2 &&
    selectedIds.every((id) => sessionFor(id)?.status === "graded");

  function goToCompare() {
    if (!canCompare) return;
    const sessionIds = selectedIds
      .map((id) => sessionFor(id)?.id)
      .filter((v): v is string => Boolean(v));
    window.location.href =
      "/admin/compare?ids=" + sessionIds.join(",") + "&candidateIds=" + selectedIds.join(",");
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
      const cand = candidates.find((c) => c.id === id);
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
    setEditName(c.name);
    setEditEmail(c.email);
    setEditAge(c.age !== null ? String(c.age) : "");
    setEditFpExperience(c.fp_experience ?? "");
    setEditFpLicense(c.fp_license ?? "");
    setEditFpAffiliation(c.fp_affiliation ?? "");
    setEditBirthdate(c.birthdate ?? "");
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(id: string) {
    const token = await getAccessToken();
    if (!token) return;
    if (!editName.trim() || !editEmail.trim()) {
      alert("氏名とメールアドレスは空にできません。");
      return;
    }
    setSavingEdit(true);
    const res = await fetch(`/api/admin/candidates/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({
        name: editName.trim(),
        email: editEmail.trim(),
        age: editAge === "" ? null : Number(editAge),
        fpExperience: editFpExperience || null,
        fpLicense: editFpLicense || null,
        fpAffiliation: editFpAffiliation || null,
        birthdate: editBirthdate || null,
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

  async function deleteCandidate(c: CandidateRow) {
    if (!confirm(`${c.name} さんを削除します。両テストの受験データもすべて削除され、元に戻せません。よろしいですか？`)) {
      return;
    }
    const token = await getAccessToken();
    if (!token) return;
    setDeletingId(c.id);
    const res = await fetch(`/api/admin/candidates/${c.id}`, {
      method: "DELETE",
      headers: { Authorization: "Bearer " + token },
    });
    setDeletingId(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.error || "削除に失敗しました。");
      return;
    }
    await load();
  }

  async function copyLink(id: string, token: string) {
    const link = origin + "/exam/" + token;
    try {
      await navigator.clipboard.writeText(link);
      setCopiedId(id);
      setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 2000);
    } catch {
      prompt("このリンクをコピーしてください:", link);
    }
  }

  async function copyLogicLink(id: string, token: string) {
    const link = origin + "/logic-exam/" + token;
    try {
      await navigator.clipboard.writeText(link);
      setCopiedLogicId(id);
      setTimeout(() => setCopiedLogicId((cur) => (cur === id ? null : cur)), 2000);
    } catch {
      prompt("このリンクをコピーしてください:", link);
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
    const body = (await res.json()) as { logicInviteToken?: string };
    await load();
    if (body.logicInviteToken) {
      await copyLogicLink(candidateId, body.logicInviteToken);
    }
  }

  function toggleExpand(id: string) {
    setExpandedId((cur) => (cur === id ? null : id));
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
            <h1>候補者管理</h1>
            <p>候補者の招待と受験状況を管理します。</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <a href="/admin/employees" className="btn btn-outline btn-sm">
              社員管理
            </a>
            {myRole === "super_admin" && (
              <a href="/admin/admins" className="btn btn-outline btn-sm">
                管理者管理
              </a>
            )}
          </div>
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
            <div className="field">
              <label htmlFor="cand-birthdate">生年月日</label>
              <input
                id="cand-birthdate"
                type="date"
                value={birthdate}
                onChange={(e) => setBirthdate(e.target.value)}
                required
              />
            </div>
            <button onClick={handleAddCandidate} disabled={adding} className="btn btn-primary">
              {adding ? "登録中..." : "候補者を追加"}
            </button>
          </div>
          <p className="text-muted" style={{ fontSize: 12, marginBottom: 0 }}>
            ※ 登録すると、金融リテラシーチェックテストとロジカルシンキング適性テスト、両方の招待リンクが同時に発行されます。
          </p>
          {addError && <div className="alert alert-error" style={{ marginTop: 12, marginBottom: 0 }}>{addError}</div>}
        </div>
      </div>

      <div className="section" style={{ marginBottom: 0 }}>
        <div className="section-title">
          <span className="dot" />
          <h2>候補者一覧</h2>
        </div>
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: "20px 20px 12px" }}>
            {gradeError && <div className="alert alert-error">{gradeError}</div>}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              <span className="text-muted" style={{ fontSize: 12 }}>
                🟢採点済　🟡受験中　🟠採点待ち　⚪未受験　⚫未発行
              </span>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={selectAllNotStarted} className="btn btn-outline btn-sm">
                  未受験を選択
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
                  招待リンク一覧
                </button>
                <button onClick={goToCompare} disabled={!canCompare} className="btn btn-primary btn-sm">
                  比較する({selectedIds.length})
                </button>
              </div>
            </div>

            {showInviteList && (
              <div
                className="card"
                style={{ background: "#f7f8fa", marginTop: 12, marginBottom: 0, padding: 16 }}
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
          </div>

          <div className="table-wrap" style={{ overflow: "visible", border: "none", borderRadius: 0 }}>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ padding: "8px 12px" }}></th>
                  <th style={{ padding: "8px 12px" }}>氏名</th>
                  <th style={{ padding: "8px 12px" }}>属性</th>
                  <th style={{ padding: "8px 12px" }}>金融リテラシー</th>
                  <th style={{ padding: "8px 12px" }}>ロジカル</th>
                  <th style={{ padding: "8px 12px" }}></th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((c) => {
                  if (editingId === c.id) {
                    return (
                      <tr key={c.id}>
                        <td style={{ padding: "8px 12px" }}>
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(c.id)}
                            onChange={() => toggleSelect(c.id)}
                          />
                        </td>
                        <td style={{ padding: "8px 12px" }}>
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            style={{ width: 100 }}
                          />
                        </td>
                        <td colSpan={4} style={{ padding: "8px 12px" }}>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                            <input
                              type="email"
                              value={editEmail}
                              onChange={(e) => setEditEmail(e.target.value)}
                              style={{ width: 160 }}
                            />
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
                            <input
                              type="date"
                              value={editBirthdate}
                              onChange={(e) => setEditBirthdate(e.target.value)}
                            />
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
                    );
                  }

                  const session = sessionFor(c.id);
                  const mainStatus = session?.status ?? "not_started";
                  const lc = logicCandidateFor(c.id);
                  const ls = lc ? logicSessionFor(lc.id) : null;
                  const logicStatus = !lc ? "not_issued" : ls?.status ?? "not_started";
                  const attrText =
                    [c.age !== null ? `${c.age}歳` : null, c.fp_affiliation, c.fp_experience]
                      .filter(Boolean)
                      .join("・") || "-";

                  return (
                    <>
                      <tr key={c.id} style={{ height: 52 }}>
                        <td style={{ padding: "8px 12px" }}>
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(c.id)}
                            onChange={() => toggleSelect(c.id)}
                          />
                        </td>
                        <td style={{ padding: "8px 12px", fontWeight: 500 }}>{c.name}</td>
                        <td className="text-muted" style={{ padding: "8px 12px", fontSize: 12 }}>
                          {attrText}
                        </td>
                        <td style={{ padding: "8px 12px" }}>
                          <CompactStatus dot={MAIN_STATUS_DOT[mainStatus]} text={MAIN_STATUS_TEXT[mainStatus]} />
                        </td>
                        <td style={{ padding: "8px 12px" }}>
                          <CompactStatus dot={LOGIC_STATUS_DOT[logicStatus]} text={LOGIC_STATUS_TEXT[logicStatus]} />
                          {lc?.mbti && (
                            <span className="text-muted" style={{ fontSize: 11, marginLeft: 6 }}>
                              {formatMbti(lc.mbti)}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: "8px 12px", position: "relative", textAlign: "right", whiteSpace: "nowrap" }}>
                          <button
                            onClick={() => toggleExpand(c.id)}
                            className="btn btn-outline btn-sm"
                          >
                            {expandedId === c.id ? "閉じる" : "詳細"}
                          </button>
                          <button
                            onClick={() => setOpenMenuId((cur) => (cur === c.id ? null : c.id))}
                            className="btn btn-outline btn-sm"
                            style={{ marginLeft: 4, padding: "4px 10px", fontSize: 16, lineHeight: 1 }}
                            aria-label="操作メニュー"
                          >
                            ⋮
                          </button>
                          {openMenuId === c.id && (
                            <>
                              <div
                                onClick={() => setOpenMenuId(null)}
                                style={{ position: "fixed", inset: 0, zIndex: 20 }}
                              />
                              <div
                                style={{
                                  position: "absolute",
                                  top: "100%",
                                  right: 12,
                                  marginTop: 4,
                                  background: "#fff",
                                  border: "1px solid var(--color-border)",
                                  borderRadius: "var(--radius-md)",
                                  boxShadow: "var(--shadow-md)",
                                  minWidth: 120,
                                  overflow: "hidden",
                                  zIndex: 21,
                                }}
                              >
                                <button
                                  onClick={() => {
                                    setOpenMenuId(null);
                                    startEdit(c);
                                  }}
                                  style={{
                                    display: "block",
                                    width: "100%",
                                    textAlign: "left",
                                    padding: "10px 14px",
                                    border: "none",
                                    background: "none",
                                    cursor: "pointer",
                                    fontSize: 13,
                                  }}
                                >
                                  編集
                                </button>
                                <button
                                  onClick={() => {
                                    setOpenMenuId(null);
                                    deleteCandidate(c);
                                  }}
                                  disabled={deletingId === c.id}
                                  style={{
                                    display: "block",
                                    width: "100%",
                                    textAlign: "left",
                                    padding: "10px 14px",
                                    border: "none",
                                    background: "none",
                                    cursor: "pointer",
                                    fontSize: 13,
                                    color: "var(--color-error)",
                                  }}
                                >
                                  {deletingId === c.id ? "削除中..." : "削除"}
                                </button>
                              </div>
                            </>
                          )}
                        </td>
                      </tr>
                      {expandedId === c.id && (
                        <tr key={c.id + "-detail"}>
                          <td colSpan={6} style={{ background: "#f8fafc", padding: "16px 24px" }}>
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                marginBottom: 12,
                              }}
                            >
                              <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
                                {c.email}
                              </div>
                              <a href={"/admin/candidate/" + c.id} className="btn btn-gold btn-sm">
                                総合レポートを見る
                              </a>
                            </div>
                            <div
                              className="text-muted"
                              style={{ fontSize: 12, marginBottom: 12 }}
                            >
                              金融リテラシー招待: {c.invited_by ?? "不明"} が {formatDateTime(c.created_at)} に発行
                              {lc && (
                                <>
                                  {" ・ "}
                                  ロジカル招待: {lc.invited_by ?? "不明"} が {formatDateTime(lc.created_at)} に発行
                                </>
                              )}
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                                <span style={{ fontSize: 12, fontWeight: 600, minWidth: 140 }}>
                                  金融リテラシーテスト
                                </span>
                                <CompactStatus dot={MAIN_STATUS_DOT[mainStatus]} text={MAIN_STATUS_TEXT[mainStatus]} />
                                <button
                                  onClick={() => copyLink(c.id, c.invite_token)}
                                  className="btn btn-outline btn-sm"
                                >
                                  {copiedId === c.id ? "コピーしました" : "リンクをコピー"}
                                </button>
                                {mainStatus === "submitted" && session && (
                                  <button
                                    onClick={() => gradeSession(session.id)}
                                    disabled={gradingId === session.id}
                                    className="btn btn-outline btn-sm"
                                  >
                                    {gradingId === session.id ? "採点中..." : "採点する"}
                                  </button>
                                )}
                                {mainStatus === "graded" && session && (
                                  <a href={"/admin/report/" + session.id} className="btn btn-outline btn-sm">
                                    詳細レポート
                                  </a>
                                )}
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                                <span style={{ fontSize: 12, fontWeight: 600, minWidth: 140 }}>
                                  ロジカルシンキング適性テスト
                                </span>
                                <CompactStatus dot={LOGIC_STATUS_DOT[logicStatus]} text={LOGIC_STATUS_TEXT[logicStatus]} />
                                {!lc ? (
                                  <button
                                    onClick={() => issueLogicInvite(c.id)}
                                    disabled={issuingLogicId === c.id}
                                    className="btn btn-outline btn-sm"
                                  >
                                    {issuingLogicId === c.id
                                      ? "発行中..."
                                      : copiedLogicId === c.id
                                      ? "コピーしました"
                                      : "招待を発行してコピー"}
                                  </button>
                                ) : (
                                  <>
                                    <button
                                      onClick={() => copyLogicLink(c.id, lc.invite_token)}
                                      className="btn btn-outline btn-sm"
                                    >
                                      {copiedLogicId === c.id ? "コピーしました" : "リンクをコピー"}
                                    </button>
                                    {logicStatus === "completed" && ls && (
                                      <a
                                        href={"/admin/logic-test/report/" + ls.id}
                                        className="btn btn-outline btn-sm"
                                      >
                                        詳細レポート
                                      </a>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
            {candidates.length === 0 && (
              <div className="table-empty">まだ候補者が登録されていません。</div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}