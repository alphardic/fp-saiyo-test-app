"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { getKyuseiKigaku, getRokuseiSenjutsu } from "@/lib/fortune";
import { computeCompatibility, CompatibilityProfile } from "@/lib/compatibility";
import type { RoleFitEntry, TeamAnalysis } from "@/lib/aiGrading";

interface EmployeeRow {
  id: string;
  name: string;
  department: string | null;
  birthdate: string | null;
  mbti: string | null;
  suitable_roles: RoleFitEntry[] | null;
  team_id: string | null;
  is_team_leader: boolean;
}

interface TeamRow {
  id: string;
  name: string;
  department: string | null;
  goal: string | null;
  ai_analysis: TeamAnalysis | null;
  ai_analysis_generated_at: string | null;
  created_at: string;
}

function StarRating({ stars }: { stars: number }) {
  return (
    <span style={{ color: "#c9a24b", letterSpacing: 1 }}>
      {"★".repeat(stars)}
      <span style={{ color: "#dcdfe4" }}>{"★".repeat(5 - stars)}</span>
    </span>
  );
}

function scoreColor(score: number): string {
  if (score >= 80) return "#2f9e44";
  if (score >= 70) return "#74b816";
  return "#adb5bd";
}

export default function AssignmentPage() {
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [department, setDepartment] = useState("");
  const [goal, setGoal] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDepartment, setEditDepartment] = useState("");
  const [editGoal, setEditGoal] = useState("");

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverTeamId, setDragOverTeamId] = useState<string | null>(null);
  const [dragOverPool, setDragOverPool] = useState(false);

  const [analyzingTeamId, setAnalyzingTeamId] = useState<string | null>(null);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState<{ done: number; total: number } | null>(null);

  async function getAccessToken(): Promise<string | null> {
    const { data } = await supabaseBrowser.auth.getSession();
    return data.session?.access_token ?? null;
  }

  async function load() {
    setLoading(true);
    setError(null);
    const token = await getAccessToken();
    if (!token) {
      setError("ログインが必要です。");
      setLoading(false);
      return;
    }
    try {
      const [empRes, teamRes] = await Promise.all([
        fetch("/api/admin/employees", { headers: { Authorization: "Bearer " + token } }),
        fetch("/api/admin/teams", { headers: { Authorization: "Bearer " + token } }),
      ]);
      const empJson = await empRes.json();
      if (!empRes.ok) throw new Error(empJson.error || "社員データの取得に失敗しました。");
      const teamJson = await teamRes.json();
      if (!teamRes.ok) throw new Error(teamJson.error || "チームデータの取得に失敗しました。");
      setEmployees(empJson.employees ?? []);
      setTeams(teamJson.teams ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "エラーが発生しました。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAddTeam() {
    setAddError(null);
    if (!name.trim()) {
      setAddError("チーム名を入力してください。");
      return;
    }
    const token = await getAccessToken();
    if (!token) return;
    setAdding(true);
    const res = await fetch("/api/admin/teams", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({
        name: name.trim(),
        department: department || null,
        goal: goal || null,
      }),
    });
    setAdding(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setAddError(body.error || "登録に失敗しました。");
      return;
    }
    setName("");
    setDepartment("");
    setGoal("");
    await load();
  }

  function startEditTeam(t: TeamRow) {
    setEditingTeamId(t.id);
    setEditName(t.name);
    setEditDepartment(t.department ?? "");
    setEditGoal(t.goal ?? "");
  }

  async function saveEditTeam(id: string) {
    if (!editName.trim()) {
      alert("チーム名を入力してください。");
      return;
    }
    const token = await getAccessToken();
    if (!token) return;
    const res = await fetch(`/api/admin/teams/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({
        name: editName.trim(),
        department: editDepartment || null,
        goal: editGoal || null,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.error || "更新に失敗しました。");
      return;
    }
    setEditingTeamId(null);
    await load();
  }

  async function deleteTeam(t: TeamRow) {
    if (!confirm(`「${t.name}」を削除します。よろしいですか？`)) return;
    const token = await getAccessToken();
    if (!token) return;
    const res = await fetch(`/api/admin/teams/${t.id}`, {
      method: "DELETE",
      headers: { Authorization: "Bearer " + token },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.error || "削除に失敗しました。");
      return;
    }
    await load();
  }

  async function assignTo(employeeId: string, teamId: string | null, isLeader = false) {
    const token = await getAccessToken();
    if (!token) return;
    const res = await fetch(`/api/admin/employees/${employeeId}/team`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({ teamId, isLeader }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.error || "配属の更新に失敗しました。");
      return;
    }
    await load();
  }

  function handleDrop(teamId: string | null) {
    setDragOverTeamId(null);
    setDragOverPool(false);
    if (!draggingId) return;
    const employeeId = draggingId;
    setDraggingId(null);
    assignTo(employeeId, teamId, false);
  }

  async function analyzeTeam(teamId: string) {
    setAnalyzeError(null);
    const token = await getAccessToken();
    if (!token) return;
    setAnalyzingTeamId(teamId);
    const res = await fetch(`/api/admin/teams/${teamId}/analyze`, {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
    });
    setAnalyzingTeamId(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setAnalyzeError(body.error || "分析に失敗しました。");
      return;
    }
    await load();
  }

  async function bulkGenerateSuitableRoles() {
    const token = await getAccessToken();
    if (!token) return;
    const targets = employees.filter((e) => !e.suitable_roles && e.mbti && e.birthdate);
    if (targets.length === 0) return;
    setGenerating(true);
    setGenProgress({ done: 0, total: targets.length });
    for (let i = 0; i < targets.length; i++) {
      try {
        await fetch(`/api/admin/employees/${targets[i].id}/suitable-roles`, {
          method: "POST",
          headers: { Authorization: "Bearer " + token },
        });
      } catch {
        // 1人分の失敗は無視して続行する
      }
      setGenProgress({ done: i + 1, total: targets.length });
    }
    setGenerating(false);
    await load();
  }

  function membersOf(teamId: string) {
    return employees
      .filter((e) => e.team_id === teamId)
      .sort((a, b) => Number(b.is_team_leader) - Number(a.is_team_leader));
  }

  function profileFor(e: EmployeeRow): CompatibilityProfile | null {
    if (!e.mbti || !e.birthdate) return null;
    const birthdate = new Date(e.birthdate);
    const kyuseiStar = getKyuseiKigaku(birthdate);
    const rokusei = getRokuseiSenjutsu(birthdate);
    if (!kyuseiStar || !rokusei) return null;
    return { mbti: e.mbti, kyuseiStar, rokusei };
  }

  // ホバー中のチームに、ドラッグ中の社員を加えた場合の参考情報(適性★上位・チーム内の相性)
  function renderDragHint(team: TeamRow) {
    if (!draggingId) return null;
    const dragged = employees.find((e) => e.id === draggingId);
    if (!dragged) return null;

    const topRoles = (dragged.suitable_roles ?? []).slice(0, 3);
    const draggedProfile = profileFor(dragged);
    const currentMembers = membersOf(team.id).filter((m) => m.id !== dragged.id);

    return (
      <div
        style={{
          marginTop: 8,
          padding: 8,
          borderRadius: 6,
          background: "#fff8e6",
          border: "1px dashed #c9a24b",
          fontSize: 12,
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 4 }}>{dragged.name} さんを加えた場合</div>
        {topRoles.length > 0 ? (
          <div>
            適性職種(上位):{" "}
            {topRoles.map((r) => (
              <span key={r.role} style={{ marginRight: 8 }}>
                {r.role} <StarRating stars={r.stars} />
              </span>
            ))}
          </div>
        ) : (
          <div className="text-muted">適性職種が未生成です</div>
        )}
        {currentMembers.length > 0 && draggedProfile && (
          <div style={{ marginTop: 4 }}>
            既存メンバーとの相性:
            {currentMembers.map((mate) => {
              const mateProfile = profileFor(mate);
              if (!mateProfile) return null;
              const score = computeCompatibility(draggedProfile, mateProfile).overall;
              return (
                <span key={mate.id} style={{ marginLeft: 6 }}>
                  {mate.name}
                  <span style={{ color: scoreColor(score), fontWeight: 600 }}> {score}点</span>
                </span>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  const unassigned = employees.filter((e) => !e.team_id);
  const missingRolesCount = employees.filter(
    (e) => !e.suitable_roles && e.mbti && e.birthdate
  ).length;

  if (loading) {
    return (
      <main className="page">
        <p className="text-muted">読み込み中...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="page page-narrow">
        <div className="card">
          <div className="alert alert-error" style={{ marginBottom: 12 }}>
            {error}
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
        <a href="/admin/employees" className="text-muted" style={{ fontSize: 13 }}>
          ← 社員一覧へ戻る
        </a>
        <h1 style={{ marginTop: 8 }}>配属シミュレーション</h1>
        <p>
          チームを登録し、リーダー・メンバーをドラッグ&ドロップで配属しましょう。メンバーが揃ったら「AIでチーム分析」で、相性・強み・目標達成へのアドバイスを生成できます。
        </p>
      </div>

      <div className="section">
        <div className="section-title">
          <span className="dot" />
          <h2>チームの登録</h2>
        </div>
        <div className="card">
          <div className="form-row" style={{ marginBottom: 16 }}>
            <div className="field">
              <label htmlFor="team-name">チーム名</label>
              <input
                id="team-name"
                type="text"
                placeholder="営業第一チーム"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="team-department">部署(任意)</label>
              <input
                id="team-department"
                type="text"
                placeholder="営業部"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
              />
            </div>
          </div>
          <div className="form-row" style={{ marginBottom: 16 }}>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="team-goal">チームの役割・目標(任意)</label>
              <input
                id="team-goal"
                type="text"
                placeholder="新規開拓の強化と紹介案件の獲得"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                style={{ width: "100%" }}
              />
            </div>
            <button onClick={handleAddTeam} disabled={adding} className="btn btn-primary">
              {adding ? "登録中..." : "チームを追加"}
            </button>
          </div>
          {addError && <div className="alert alert-error" style={{ marginBottom: 0 }}>{addError}</div>}

          {teams.length > 0 && (
            <div className="table-wrap" style={{ marginTop: 16 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>チーム名</th>
                    <th>部署</th>
                    <th>目標・役割</th>
                    <th>人数</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {teams.map((t) => {
                    if (editingTeamId === t.id) {
                      return (
                        <tr key={t.id}>
                          <td colSpan={5}>
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                              <input
                                type="text"
                                value={editName}
                                onChange={(ev) => setEditName(ev.target.value)}
                                style={{ width: 140 }}
                              />
                              <input
                                type="text"
                                placeholder="部署"
                                value={editDepartment}
                                onChange={(ev) => setEditDepartment(ev.target.value)}
                                style={{ width: 100 }}
                              />
                              <input
                                type="text"
                                placeholder="目標・役割"
                                value={editGoal}
                                onChange={(ev) => setEditGoal(ev.target.value)}
                                style={{ width: 220 }}
                              />
                              <button onClick={() => saveEditTeam(t.id)} className="btn btn-primary btn-sm">
                                保存
                              </button>
                              <button onClick={() => setEditingTeamId(null)} className="btn btn-outline btn-sm">
                                キャンセル
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    }
                    return (
                      <tr key={t.id}>
                        <td style={{ fontWeight: 500 }}>{t.name}</td>
                        <td className="text-muted">{t.department || "-"}</td>
                        <td className="text-muted" style={{ fontSize: 12 }}>
                          {t.goal || "-"}
                        </td>
                        <td className="text-muted">{membersOf(t.id).length}名</td>
                        <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                          <button onClick={() => startEditTeam(t)} className="btn btn-outline btn-sm">
                            編集
                          </button>
                          <button
                            onClick={() => deleteTeam(t)}
                            className="btn btn-outline btn-sm"
                            style={{ marginLeft: 4, color: "var(--color-error)" }}
                          >
                            削除
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="section" style={{ marginBottom: 0 }}>
        <div className="section-title">
          <span className="dot" />
          <h2>配属ボード</h2>
        </div>

        <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div
            className="card"
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverPool(true);
            }}
            onDragLeave={() => setDragOverPool(false)}
            onDrop={() => handleDrop(null)}
            style={{
              width: 260,
              minHeight: 200,
              flexShrink: 0,
              border: dragOverPool ? "2px dashed #c9a24b" : undefined,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 8 }}>未配属({unassigned.length}名)</div>
            {missingRolesCount > 0 && (
              <div style={{ marginBottom: 8 }}>
                <button
                  onClick={bulkGenerateSuitableRoles}
                  disabled={generating}
                  className="btn btn-outline btn-sm"
                  style={{ width: "100%" }}
                >
                  {generating
                    ? `生成中... ${genProgress?.done ?? 0}/${genProgress?.total ?? 0}`
                    : `適性職種を一括生成(${missingRolesCount}名)`}
                </button>
                <div className="text-muted" style={{ fontSize: 11, marginTop: 4 }}>
                  AI生成のため数十秒〜数分かかります。
                </div>
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {unassigned.map((e) => (
                <div
                  key={e.id}
                  draggable
                  onDragStart={() => setDraggingId(e.id)}
                  onDragEnd={() => setDraggingId(null)}
                  className="badge badge-muted"
                  style={{ cursor: "grab", justifyContent: "flex-start" }}
                >
                  {e.name}
                  {e.department ? <span style={{ marginLeft: 6, fontSize: 11 }}>({e.department})</span> : null}
                </div>
              ))}
              {unassigned.length === 0 && (
                <div className="text-muted" style={{ fontSize: 12 }}>
                  未配属の社員はいません。
                </div>
              )}
            </div>
          </div>

          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", flex: 1 }}>
            {teams.map((t) => {
              const members = membersOf(t.id);
              const analysis = t.ai_analysis;
              return (
                <div
                  key={t.id}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverTeamId(t.id);
                  }}
                  onDragLeave={() => setDragOverTeamId((cur) => (cur === t.id ? null : cur))}
                  onDrop={() => handleDrop(t.id)}
                  className="card"
                  style={{
                    width: 320,
                    minHeight: 160,
                    border: dragOverTeamId === t.id ? "2px dashed #c9a24b" : undefined,
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{t.name}</div>
                  <div className="text-muted" style={{ fontSize: 12, marginBottom: 4 }}>
                    {t.department || "部署未設定"}
                  </div>
                  {t.goal && (
                    <div className="text-muted" style={{ fontSize: 12, marginBottom: 8 }}>
                      目標: {t.goal}
                    </div>
                  )}

                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
                    {members.map((m) => (
                      <div
                        key={m.id}
                        draggable
                        onDragStart={() => setDraggingId(m.id)}
                        onDragEnd={() => setDraggingId(null)}
                        className={m.is_team_leader ? "badge badge-done" : "badge badge-muted"}
                        style={{ cursor: "grab", justifyContent: "space-between" }}
                      >
                        <span>
                          {m.is_team_leader ? "★ " : ""}
                          {m.name}
                        </span>
                        {!m.is_team_leader && (
                          <button
                            onClick={() => assignTo(m.id, t.id, true)}
                            className="btn btn-outline btn-sm"
                            style={{ padding: "0 6px", fontSize: 11, marginLeft: 6 }}
                          >
                            リーダーにする
                          </button>
                        )}
                      </div>
                    ))}
                    {members.length === 0 && (
                      <div className="text-muted" style={{ fontSize: 12 }}>
                        ここに社員をドラッグして配属
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => analyzeTeam(t.id)}
                    disabled={members.length === 0 || analyzingTeamId === t.id}
                    className="btn btn-gold btn-sm"
                    style={{ width: "100%", marginBottom: 8 }}
                  >
                    {analyzingTeamId === t.id ? "分析中..." : "AIでチーム分析"}
                  </button>
                  {analyzeError && analyzingTeamId === null && (
                    <div className="alert alert-error" style={{ fontSize: 12, marginBottom: 8 }}>
                      {analyzeError}
                    </div>
                  )}

                  {analysis && (
                    <div style={{ fontSize: 12, background: "#f8fafc", borderRadius: 6, padding: 8 }}>
                      {t.ai_analysis_generated_at && (
                        <div className="text-muted" style={{ marginBottom: 6 }}>
                          分析日時: {new Date(t.ai_analysis_generated_at).toLocaleString("ja-JP")}
                        </div>
                      )}
                      <div style={{ marginBottom: 6 }}>
                        <strong>相性傾向</strong>
                        <div>{analysis.overallSummary}</div>
                      </div>
                      <div style={{ marginBottom: 6 }}>
                        <strong>活かせる強み</strong>
                        <div>{analysis.strengths}</div>
                      </div>
                      <div style={{ marginBottom: 6 }}>
                        <strong>目標達成へのアドバイス</strong>
                        <div>{analysis.goalAdvice}</div>
                      </div>
                      {analysis.memberNotes.length > 0 && (
                        <div>
                          <strong>メンバーごとの活かし方</strong>
                          {analysis.memberNotes.map((n, i) => (
                            <div key={i} style={{ marginTop: 2 }}>
                              <span style={{ fontWeight: 600 }}>{n.name}: </span>
                              {n.note}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {dragOverTeamId === t.id && renderDragHint(t)}
                </div>
              );
            })}
            {teams.length === 0 && (
              <div className="text-muted" style={{ fontSize: 13 }}>
                まだチームが登録されていません。上のフォームから登録してください。
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
