"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

interface EmployeeRow {
  id: string;
  name: string;
  email: string | null;
  department: string | null;
  birthdate: string | null;
  mbti: string | null;
  notes: string | null;
  invited_by: string | null;
  created_at: string;
}

const MBTI_TYPES = [
  { code: "INTJ", name: "建築家" },
  { code: "INTP", name: "論理学者" },
  { code: "ENTJ", name: "指揮官" },
  { code: "ENTP", name: "討論者" },
  { code: "INFJ", name: "提唱者" },
  { code: "INFP", name: "仲介者" },
  { code: "ENFJ", name: "主人公" },
  { code: "ENFP", name: "広報運動家" },
  { code: "ISTJ", name: "管理者" },
  { code: "ISFJ", name: "擁護者" },
  { code: "ESTJ", name: "幹部" },
  { code: "ESFJ", name: "領事官" },
  { code: "ISTP", name: "巨匠" },
  { code: "ISFP", name: "冒険家" },
  { code: "ESTP", name: "起業家" },
  { code: "ESFP", name: "エンターテイナー" },
];

function formatDate(iso: string | null) {
  if (!iso) return "-";
  return iso;
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [department, setDepartment] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [mbti, setMbti] = useState("");
  const [notes, setNotes] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editDepartment, setEditDepartment] = useState("");
  const [editBirthdate, setEditBirthdate] = useState("");
  const [editMbti, setEditMbti] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
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
    const res = await fetch("/api/admin/employees", {
      headers: { Authorization: "Bearer " + token },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setAuthError(body.error || "データの取得に失敗しました。");
      setLoading(false);
      return;
    }
    const body = await res.json();
    setEmployees(body.employees ?? []);
    setLoading(false);
  }

  async function handleAdd() {
    setAddError(null);
    if (!name.trim()) {
      setAddError("氏名を入力してください。");
      return;
    }
    if (!mbti) {
      setAddError("MBTIを選択してください(総合レポートの相性診断に必要です)。");
      return;
    }
    if (!birthdate) {
      setAddError("生年月日を入力してください(占いの計算に必要です)。");
      return;
    }
    const token = await getAccessToken();
    if (!token) {
      setAddError("ログインが必要です。");
      return;
    }
    setAdding(true);
    const res = await fetch("/api/admin/employees", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({
        name: name.trim(),
        email: email || null,
        department: department || null,
        birthdate: birthdate || null,
        mbti: mbti || null,
        notes: notes || null,
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
    setDepartment("");
    setBirthdate("");
    setMbti("");
    setNotes("");
    await load();
  }

  function startEdit(e: EmployeeRow) {
    setEditingId(e.id);
    setEditName(e.name);
    setEditEmail(e.email ?? "");
    setEditDepartment(e.department ?? "");
    setEditBirthdate(e.birthdate ?? "");
    setEditMbti(e.mbti ?? "");
    setEditNotes(e.notes ?? "");
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(id: string) {
    const token = await getAccessToken();
    if (!token) return;
    if (!editName.trim()) {
      alert("氏名を入力してください。");
      return;
    }
    if (!editMbti) {
      alert("MBTIを選択してください(総合レポートの相性診断に必要です)。");
      return;
    }
    if (!editBirthdate) {
      alert("生年月日を入力してください(占いの計算に必要です)。");
      return;
    }
    setSavingEdit(true);
    const res = await fetch(`/api/admin/employees/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({
        name: editName.trim(),
        email: editEmail || null,
        department: editDepartment || null,
        birthdate: editBirthdate || null,
        mbti: editMbti || null,
        notes: editNotes || null,
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

  async function deleteEmployee(e: EmployeeRow) {
    if (!confirm(`${e.name} さんを削除します。よろしいですか？`)) return;
    const token = await getAccessToken();
    if (!token) return;
    setDeletingId(e.id);
    const res = await fetch(`/api/admin/employees/${e.id}`, {
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
        <h1 style={{ marginTop: 8 }}>社員管理</h1>
        <p>社員の基本情報とMBTIを登録します。総合レポートで使用します。</p>
      </div>

      <div className="section">
        <div className="section-title">
          <span className="dot" />
          <h2>社員の登録</h2>
        </div>
        <div className="card">
          <div className="form-row" style={{ marginBottom: 16 }}>
            <div className="field">
              <label htmlFor="emp-name">氏名</label>
              <input
                id="emp-name"
                type="text"
                placeholder="山田 太郎"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="emp-email">メールアドレス(任意)</label>
              <input
                id="emp-email"
                type="email"
                placeholder="taro@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="emp-department">部署(任意)</label>
              <input
                id="emp-department"
                type="text"
                placeholder="営業部"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
              />
            </div>
          </div>
          <div className="form-row" style={{ marginBottom: 16 }}>
            <div className="field">
              <label htmlFor="emp-birthdate">生年月日(必須・占いの計算に使用)</label>
              <input
                id="emp-birthdate"
                type="date"
                value={birthdate}
                onChange={(e) => setBirthdate(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="emp-mbti">MBTI(必須)</label>
              <select id="emp-mbti" value={mbti} onChange={(e) => setMbti(e.target.value)}>
                <option value="">未選択</option>
                {MBTI_TYPES.map((t) => (
                  <option key={t.code} value={t.code}>
                    {t.code}({t.name})
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="emp-notes">メモ(任意)</label>
              <input
                id="emp-notes"
                type="text"
                placeholder="配属・特記事項など"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            <button onClick={handleAdd} disabled={adding} className="btn btn-primary">
              {adding ? "登録中..." : "社員を追加"}
            </button>
          </div>
          {addError && <div className="alert alert-error" style={{ marginBottom: 0 }}>{addError}</div>}
        </div>
      </div>

      <div className="section" style={{ marginBottom: 0 }}>
        <div className="section-title">
          <span className="dot" />
          <h2>社員一覧</h2>
        </div>
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>氏名</th>
                  <th>部署</th>
                  <th>生年月日</th>
                  <th>MBTI</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {employees.map((e) => {
                  if (editingId === e.id) {
                    return (
                      <tr key={e.id}>
                        <td>
                          <input
                            type="text"
                            value={editName}
                            onChange={(ev) => setEditName(ev.target.value)}
                            style={{ width: 100 }}
                          />
                        </td>
                        <td colSpan={4}>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                            <input
                              type="email"
                              placeholder="メール"
                              value={editEmail}
                              onChange={(ev) => setEditEmail(ev.target.value)}
                              style={{ width: 150 }}
                            />
                            <input
                              type="text"
                              placeholder="部署"
                              value={editDepartment}
                              onChange={(ev) => setEditDepartment(ev.target.value)}
                              style={{ width: 100 }}
                            />
                            <input
                              type="date"
                              value={editBirthdate}
                              onChange={(ev) => setEditBirthdate(ev.target.value)}
                            />
                            <select value={editMbti} onChange={(ev) => setEditMbti(ev.target.value)}>
                              <option value="">MBTI未選択</option>
                              {MBTI_TYPES.map((t) => (
                                <option key={t.code} value={t.code}>
                                  {t.code}({t.name})
                                </option>
                              ))}
                            </select>
                            <input
                              type="text"
                              placeholder="メモ"
                              value={editNotes}
                              onChange={(ev) => setEditNotes(ev.target.value)}
                              style={{ width: 120 }}
                            />
                            <button
                              onClick={() => saveEdit(e.id)}
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
                  return (
                    <tr key={e.id}>
                      <td style={{ fontWeight: 500 }}>{e.name}</td>
                      <td className="text-muted">{e.department || "-"}</td>
                      <td className="text-muted">{formatDate(e.birthdate)}</td>
                      <td className="text-muted">{e.mbti || "-"}</td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        <a href={"/admin/employees/" + e.id} className="btn btn-gold btn-sm">
                          総合レポート
                        </a>
                        <button
                          onClick={() => startEdit(e)}
                          className="btn btn-outline btn-sm"
                          style={{ marginLeft: 4 }}
                        >
                          編集
                        </button>
                        <button
                          onClick={() => deleteEmployee(e)}
                          disabled={deletingId === e.id}
                          className="btn btn-outline btn-sm"
                          style={{ marginLeft: 4, color: "var(--color-error)" }}
                        >
                          {deletingId === e.id ? "削除中..." : "削除"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {employees.length === 0 && (
              <div className="table-empty">まだ社員が登録されていません。</div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}