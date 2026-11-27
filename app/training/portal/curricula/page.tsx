"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { portalHeaders, PORTAL_HOME_PATH, PORTAL_LOGIN_PATH } from "@/lib/trainingPortalClient";

/**
 * 社員用ポータル: カリキュラム(テストを順番に並べたもの)を作る・並べ替える。
 * 受講者の招待は管理者が管理画面から行う。
 */

interface Item {
  courseId: string;
  name: string;
  status: string;
  hasVideo: boolean;
}

interface Curriculum {
  id: string;
  name: string;
  description: string | null;
  items: Item[];
}

interface SelectableCourse {
  id: string;
  name: string;
  status: string;
}

const STATUS_LABEL: Record<string, string> = {
  draft: "作成中",
  pending: "承認待ち",
  rejected: "差し戻し",
  active: "配布中",
  archived: "終了",
};

export default function PortalCurriculaPage() {
  const router = useRouter();
  const [curricula, setCurricula] = useState<Curriculum[]>([]);
  const [courses, setCourses] = useState<SelectableCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [addCourseId, setAddCourseId] = useState<Record<string, string>>({});

  const api = useCallback(
    async (path: string, method = "GET", json?: unknown) => {
      const headers = await portalHeaders();
      if (!headers.Authorization) {
        router.replace(PORTAL_LOGIN_PATH);
        throw new Error("ログインが必要です。");
      }
      const res = await fetch(path, {
        method,
        headers: json !== undefined ? { ...headers, "Content-Type": "application/json" } : headers,
        body: json !== undefined ? JSON.stringify(json) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "処理に失敗しました。");
      return data;
    },
    [router]
  );

  const load = useCallback(async () => {
    try {
      const data = await api("/api/training/authoring/curricula");
      setCurricula(data.curricula ?? []);
      setCourses(data.courses ?? []);
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
    }
    setLoading(false);
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(fn: () => Promise<unknown>, okText: string) {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
      await load();
      setMessage({ ok: true, text: okText });
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
    }
    setBusy(false);
  }

  function saveOrder(c: Curriculum, courseIds: string[]) {
    return act(() => api(`/api/training/authoring/curricula/${c.id}`, "PATCH", { courseIds }), "並び順を保存しました。");
  }

  function move(c: Curriculum, index: number, delta: number) {
    const ids = c.items.map((i) => i.courseId);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    return saveOrder(c, ids);
  }

  if (loading) {
    return (
      <main className="page page-narrow">
        <p className="text-muted">読み込み中...</p>
      </main>
    );
  }

  return (
    <main className="page page-wide">
      <div className="page-header">
        <h1>カリキュラム</h1>
        <p>
          テストを順番に並べて、研修のコースにします。受講者は上から順に、前のテストに合格すると次に進めます。
          受講者の招待は管理者が行います。
          <a href={PORTAL_HOME_PATH} style={{ marginLeft: 8 }}>
            ポータルのトップへ戻る
          </a>
        </p>
      </div>

      {message && <div className={`alert ${message.ok ? "alert-success" : "alert-error"}`}>{message.text}</div>}

      {curricula.length === 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <p className="text-muted" style={{ margin: 0 }}>まだカリキュラムがありません。下から作成してください。</p>
        </div>
      )}

      {curricula.map((c) => {
        const candidates = courses.filter((course) => !c.items.some((i) => i.courseId === course.id));
        return (
          <div className="section" key={c.id}>
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <div>
                  <p style={{ fontWeight: 700, fontSize: 18, margin: 0 }}>{c.name}</p>
                  {c.description && <p className="text-muted" style={{ marginTop: 4 }}>{c.description}</p>}
                </div>
                <button
                  className="btn btn-outline btn-sm"
                  disabled={busy}
                  onClick={() => {
                    if (confirm(`「${c.name}」を削除しますか？(テスト自体は消えません)`)) {
                      act(() => api(`/api/training/authoring/curricula/${c.id}`, "DELETE"), "カリキュラムを削除しました。");
                    }
                  }}
                >
                  削除
                </button>
              </div>

              {c.items.length === 0 ? (
                <p className="text-muted">まだテストが入っていません。</p>
              ) : (
                <ol style={{ paddingLeft: 20, margin: "12px 0" }}>
                  {c.items.map((item, i) => (
                    <li key={item.courseId} style={{ marginBottom: 8 }}>
                      <span style={{ fontWeight: 500 }}>{item.name}</span>
                      <span className="text-muted" style={{ fontSize: 12, marginLeft: 8 }}>
                        {STATUS_LABEL[item.status] ?? item.status}
                        {item.hasVideo ? "・動画あり" : ""}
                      </span>
                      <span style={{ marginLeft: 8, whiteSpace: "nowrap" }}>
                        <button className="btn btn-outline btn-sm" disabled={busy || i === 0} onClick={() => move(c, i, -1)}>
                          ↑
                        </button>{" "}
                        <button
                          className="btn btn-outline btn-sm"
                          disabled={busy || i === c.items.length - 1}
                          onClick={() => move(c, i, 1)}
                        >
                          ↓
                        </button>{" "}
                        <button
                          className="btn btn-outline btn-sm"
                          disabled={busy}
                          onClick={() =>
                            saveOrder(
                              c,
                              c.items.map((x) => x.courseId).filter((id) => id !== item.courseId)
                            )
                          }
                        >
                          外す
                        </button>
                      </span>
                    </li>
                  ))}
                </ol>
              )}

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <select
                  value={addCourseId[c.id] ?? ""}
                  onChange={(e) => setAddCourseId({ ...addCourseId, [c.id]: e.target.value })}
                  disabled={busy}
                  style={{ width: "auto", maxWidth: 420 }}
                >
                  <option value="">追加するテストを選ぶ</option>
                  {candidates.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.name}({STATUS_LABEL[course.status] ?? course.status})
                    </option>
                  ))}
                </select>
                <button
                  className="btn btn-primary btn-sm"
                  disabled={busy || !addCourseId[c.id]}
                  onClick={() =>
                    act(
                      () => api(`/api/training/authoring/curricula/${c.id}/courses`, "POST", { courseId: addCourseId[c.id] }),
                      "テストを追加しました。"
                    ).then(() => setAddCourseId({ ...addCourseId, [c.id]: "" }))
                  }
                >
                  追加
                </button>
              </div>
              <p className="text-muted" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
                作成中のテストも入れておけます。受講者に表示されるのは配布中のテストだけです。
              </p>
            </div>
          </div>
        );
      })}

      <div className="section">
        <div className="section-title">
          <span className="dot" />
          <h2>新しいカリキュラムを作る</h2>
        </div>
        <div className="card">
          <div className="field">
            <label>カリキュラム名</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="例: 不動産営業 新人研修"
            />
          </div>
          <div className="field">
            <label>説明(任意。受講者にも表示されます)</label>
            <textarea rows={2} value={newDescription} onChange={(e) => setNewDescription(e.target.value)} />
          </div>
          <button
            className="btn btn-primary"
            disabled={busy || !newName.trim()}
            onClick={() =>
              act(
                () => api("/api/training/authoring/curricula", "POST", { name: newName, description: newDescription }),
                "カリキュラムを作成しました。"
              ).then(() => {
                setNewName("");
                setNewDescription("");
              })
            }
          >
            作成する
          </button>
        </div>
      </div>
    </main>
  );
}
