"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { getKyuseiKigaku, getRokuseiSenjutsu } from "@/lib/fortune";
import { computeCompatibility, CompatibilityProfile } from "@/lib/compatibility";
import { JOB_ROLES, RoleFitEntry } from "@/lib/aiGrading";

interface EmployeeRow {
  id: string;
  name: string;
  department: string | null;
  birthdate: string | null;
  mbti: string | null;
  suitable_roles: RoleFitEntry[] | null;
  assigned_post_id: string | null;
}

interface PostRow {
  id: string;
  title: string;
  department: string | null;
  role_category: string | null;
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
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [department, setDepartment] = useState("");
  const [roleCategory, setRoleCategory] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDepartment, setEditDepartment] = useState("");
  const [editRoleCategory, setEditRoleCategory] = useState("");

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverPostId, setDragOverPostId] = useState<string | null>(null);
  const [dragOverPool, setDragOverPool] = useState(false);

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
      const [empRes, postRes] = await Promise.all([
        fetch("/api/admin/employees", { headers: { Authorization: "Bearer " + token } }),
        fetch("/api/admin/org-posts", { headers: { Authorization: "Bearer " + token } }),
      ]);
      const empJson = await empRes.json();
      if (!empRes.ok) throw new Error(empJson.error || "社員データの取得に失敗しました。");
      const postJson = await postRes.json();
      if (!postRes.ok) throw new Error(postJson.error || "ポストデータの取得に失敗しました。");
      setEmployees(empJson.employees ?? []);
      setPosts(postJson.posts ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "エラーが発生しました。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAddPost() {
    setAddError(null);
    if (!title.trim()) {
      setAddError("タイトルを入力してください。");
      return;
    }
    const token = await getAccessToken();
    if (!token) return;
    setAdding(true);
    const res = await fetch("/api/admin/org-posts", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({
        title: title.trim(),
        department: department || null,
        role_category: roleCategory || null,
      }),
    });
    setAdding(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setAddError(body.error || "登録に失敗しました。");
      return;
    }
    setTitle("");
    setDepartment("");
    setRoleCategory("");
    await load();
  }

  function startEditPost(p: PostRow) {
    setEditingPostId(p.id);
    setEditTitle(p.title);
    setEditDepartment(p.department ?? "");
    setEditRoleCategory(p.role_category ?? "");
  }

  async function saveEditPost(id: string) {
    if (!editTitle.trim()) {
      alert("タイトルを入力してください。");
      return;
    }
    const token = await getAccessToken();
    if (!token) return;
    const res = await fetch(`/api/admin/org-posts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({
        title: editTitle.trim(),
        department: editDepartment || null,
        role_category: editRoleCategory || null,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.error || "更新に失敗しました。");
      return;
    }
    setEditingPostId(null);
    await load();
  }

  async function deletePost(p: PostRow) {
    if (!confirm(`「${p.title}」を削除します。よろしいですか？`)) return;
    const token = await getAccessToken();
    if (!token) return;
    const res = await fetch(`/api/admin/org-posts/${p.id}`, {
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

  async function assignTo(employeeId: string, postId: string | null) {
    const token = await getAccessToken();
    if (!token) return;
    const res = await fetch(`/api/admin/employees/${employeeId}/assign-post`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({ postId }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.error || "配属の更新に失敗しました。");
      return;
    }
    setEmployees((prev) =>
      prev.map((e) => (e.id === employeeId ? { ...e, assigned_post_id: postId } : e))
    );
  }

  function handleDrop(postId: string | null) {
    setDragOverPostId(null);
    setDragOverPool(false);
    if (!draggingId) return;
    const employeeId = draggingId;
    setDraggingId(null);
    assignTo(employeeId, postId);
  }

  function employeeForPost(postId: string) {
    return employees.find((e) => e.assigned_post_id === postId);
  }

  function profileFor(e: EmployeeRow): CompatibilityProfile | null {
    if (!e.mbti || !e.birthdate) return null;
    const birthdate = new Date(e.birthdate);
    const kyuseiStar = getKyuseiKigaku(birthdate);
    const rokusei = getRokuseiSenjutsu(birthdate);
    if (!kyuseiStar || !rokusei) return null;
    return { mbti: e.mbti, kyuseiStar, rokusei };
  }

  // ホバー中のポストに、ドラッグ中の社員を置いた場合の参考情報(適性★・部署内の相性)
  function renderDragHint(post: PostRow) {
    if (!draggingId) return null;
    const dragged = employees.find((e) => e.id === draggingId);
    if (!dragged) return null;

    const starEntry =
      post.role_category && dragged.suitable_roles
        ? dragged.suitable_roles.find((r) => r.role === post.role_category)
        : null;

    const draggedProfile = profileFor(dragged);
    const deptMates = post.department
      ? employees.filter((e) => {
          if (e.id === dragged.id || !e.assigned_post_id) return false;
          const theirPost = posts.find((p) => p.id === e.assigned_post_id);
          return theirPost?.department === post.department;
        })
      : [];

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
        <div style={{ fontWeight: 600, marginBottom: 4 }}>{dragged.name} さんを配属した場合</div>
        {post.role_category ? (
          starEntry ? (
            <div>
              {post.role_category}適性: <StarRating stars={starEntry.stars} />
            </div>
          ) : (
            <div className="text-muted">適性職種が未生成です(社員詳細ページで生成できます)</div>
          )
        ) : (
          <div className="text-muted">このポストには職種区分が設定されていません</div>
        )}
        {deptMates.length > 0 && draggedProfile && (
          <div style={{ marginTop: 4 }}>
            部署内の相性:
            {deptMates.map((mate) => {
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

  const unassigned = employees.filter((e) => !e.assigned_post_id);

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
          ポストを登録し、未配属の社員をドラッグ&ドロップで配属してみましょう。ポストにカーソルを合わせたまま重ねると、適性職種の★評価と部署内の相性の参考値が表示されます。
        </p>
      </div>

      <div className="section">
        <div className="section-title">
          <span className="dot" />
          <h2>ポストの登録</h2>
        </div>
        <div className="card">
          <div className="form-row" style={{ marginBottom: 16 }}>
            <div className="field">
              <label htmlFor="post-title">タイトル</label>
              <input
                id="post-title"
                type="text"
                placeholder="営業部 課長"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="post-department">部署(任意)</label>
              <input
                id="post-department"
                type="text"
                placeholder="営業部"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="post-role">職種区分(任意)</label>
              <select id="post-role" value={roleCategory} onChange={(e) => setRoleCategory(e.target.value)}>
                <option value="">未選択</option>
                {JOB_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <button onClick={handleAddPost} disabled={adding} className="btn btn-primary">
              {adding ? "登録中..." : "ポストを追加"}
            </button>
          </div>
          {addError && <div className="alert alert-error" style={{ marginBottom: 0 }}>{addError}</div>}

          {posts.length > 0 && (
            <div className="table-wrap" style={{ marginTop: 16 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>タイトル</th>
                    <th>部署</th>
                    <th>職種区分</th>
                    <th>配属中</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {posts.map((p) => {
                    if (editingPostId === p.id) {
                      return (
                        <tr key={p.id}>
                          <td colSpan={5}>
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                              <input
                                type="text"
                                value={editTitle}
                                onChange={(ev) => setEditTitle(ev.target.value)}
                                style={{ width: 140 }}
                              />
                              <input
                                type="text"
                                placeholder="部署"
                                value={editDepartment}
                                onChange={(ev) => setEditDepartment(ev.target.value)}
                                style={{ width: 100 }}
                              />
                              <select
                                value={editRoleCategory}
                                onChange={(ev) => setEditRoleCategory(ev.target.value)}
                              >
                                <option value="">職種区分未選択</option>
                                {JOB_ROLES.map((r) => (
                                  <option key={r} value={r}>
                                    {r}
                                  </option>
                                ))}
                              </select>
                              <button onClick={() => saveEditPost(p.id)} className="btn btn-primary btn-sm">
                                保存
                              </button>
                              <button onClick={() => setEditingPostId(null)} className="btn btn-outline btn-sm">
                                キャンセル
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    }
                    const occupant = employeeForPost(p.id);
                    return (
                      <tr key={p.id}>
                        <td style={{ fontWeight: 500 }}>{p.title}</td>
                        <td className="text-muted">{p.department || "-"}</td>
                        <td className="text-muted">{p.role_category || "-"}</td>
                        <td className="text-muted">{occupant ? occupant.name : "空き"}</td>
                        <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                          <button onClick={() => startEditPost(p)} className="btn btn-outline btn-sm">
                            編集
                          </button>
                          <button
                            onClick={() => deletePost(p)}
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
            {posts.map((p) => {
              const occupant = employeeForPost(p.id);
              return (
                <div
                  key={p.id}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverPostId(p.id);
                  }}
                  onDragLeave={() => setDragOverPostId((cur) => (cur === p.id ? null : cur))}
                  onDrop={() => handleDrop(p.id)}
                  className="card"
                  style={{
                    width: 260,
                    minHeight: 140,
                    border: dragOverPostId === p.id ? "2px dashed #c9a24b" : undefined,
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{p.title}</div>
                  <div className="text-muted" style={{ fontSize: 12, marginBottom: 8 }}>
                    {[p.department, p.role_category].filter(Boolean).join(" / ") || "部署・職種区分未設定"}
                  </div>
                  {occupant ? (
                    <div
                      draggable
                      onDragStart={() => setDraggingId(occupant.id)}
                      onDragEnd={() => setDraggingId(null)}
                      className="badge badge-done"
                      style={{ cursor: "grab" }}
                    >
                      {occupant.name}
                    </div>
                  ) : (
                    <div className="text-muted" style={{ fontSize: 12 }}>
                      ここに社員をドラッグして配属
                    </div>
                  )}
                  {dragOverPostId === p.id && renderDragHint(p)}
                </div>
              );
            })}
            {posts.length === 0 && (
              <div className="text-muted" style={{ fontSize: 13 }}>
                まだポストが登録されていません。上のフォームから登録してください。
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
