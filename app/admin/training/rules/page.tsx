"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

interface Rule {
  id: string;
  rule: string;
  source: "initial" | "feedback" | "manual";
  created_by: string | null;
  source_course_name: string | null;
  active: boolean;
  created_at: string;
}

const SOURCE_LABEL: Record<Rule["source"], string> = {
  initial: "初期ルール",
  feedback: "指摘から学習",
  manual: "手動で追加",
};

/**
 * 管理者向け: AIが問題を作るときに守る「作問ルール」の一覧。
 * 社員・管理者の指摘から自動で増えていくため、不適切なものはOFFにしたり書き換えたりする。
 */
export default function TrainingRulesPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newRule, setNewRule] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");

  const request = useCallback(async (path: string, init?: { method: string; json?: unknown }) => {
    const { data } = await supabaseBrowser.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("ログインが必要です。");
    const res = await fetch(path, {
      method: init?.method ?? "GET",
      headers: {
        Authorization: "Bearer " + token,
        ...(init?.json !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: init?.json !== undefined ? JSON.stringify(init.json) : undefined,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? "処理に失敗しました。");
    return body;
  }, []);

  const load = useCallback(async () => {
    try {
      const body = await request("/api/admin/training/rules");
      setRules(body.rules ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込みに失敗しました。");
    }
    setLoading(false);
  }, [request]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "処理に失敗しました。");
    }
  }

  if (loading) {
    return (
      <main className="page">
        <p className="text-muted">読み込み中...</p>
      </main>
    );
  }

  const activeCount = rules.filter((r) => r.active).length;

  return (
    <main className="page page-wide">
      <div className="page-header">
        <a href="/admin/training/authoring" className="text-muted" style={{ fontSize: 13 }}>
          ← 承認一覧へ戻る
        </a>
        <h1 style={{ marginTop: 8 }}>作問ルール</h1>
        <p>
          AIが社内テストの問題を作る・直すときに必ず守るルールです。社員や管理者が問題に指摘をすると、今後にも活かせる内容は自動でここに追加されます。
          内容が不適切なものはOFFにするか書き換えてください(現在 有効 {activeCount}件 / 全{rules.length}件)。
        </p>
      </div>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}>
          {error}
        </div>
      )}

      <div className="section">
        <div className="card">
          <div className="field">
            <label>ルールを手動で追加</label>
            <textarea rows={2} value={newRule} onChange={(e) => setNewRule(e.target.value)} />
          </div>
          <button
            className="btn btn-primary btn-sm"
            disabled={!newRule.trim()}
            onClick={() =>
              act(async () => {
                await request("/api/admin/training/rules", { method: "POST", json: { rule: newRule } });
                setNewRule("");
              })
            }
          >
            追加
          </button>
        </div>
      </div>

      <div className="section">
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 70 }}>有効</th>
                  <th>ルール</th>
                  <th>由来</th>
                  <th>追加日</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id} style={{ opacity: r.active ? 1 : 0.5 }}>
                    <td>
                      <input
                        type="checkbox"
                        checked={r.active}
                        onChange={(e) =>
                          act(() =>
                            request(`/api/admin/training/rules/${r.id}`, {
                              method: "PATCH",
                              json: { active: e.target.checked },
                            })
                          )
                        }
                      />
                    </td>
                    <td style={{ whiteSpace: "pre-wrap" }}>
                      {editingId === r.id ? (
                        <textarea rows={3} value={editingText} onChange={(e) => setEditingText(e.target.value)} />
                      ) : (
                        r.rule
                      )}
                    </td>
                    <td className="text-muted" style={{ fontSize: 13 }}>
                      {SOURCE_LABEL[r.source]}
                      {r.created_by ? ` ・ ${r.created_by}` : ""}
                      {r.source_course_name ? (
                        <div style={{ fontSize: 12 }}>({r.source_course_name})</div>
                      ) : null}
                    </td>
                    <td className="text-muted" style={{ whiteSpace: "nowrap" }}>
                      {new Date(r.created_at).toLocaleDateString("ja-JP")}
                    </td>
                    <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                      {editingId === r.id ? (
                        <>
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() =>
                              act(async () => {
                                await request(`/api/admin/training/rules/${r.id}`, {
                                  method: "PATCH",
                                  json: { rule: editingText },
                                });
                                setEditingId(null);
                              })
                            }
                          >
                            保存
                          </button>{" "}
                          <button className="btn btn-outline btn-sm" onClick={() => setEditingId(null)}>
                            取消
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            className="btn btn-outline btn-sm"
                            onClick={() => {
                              setEditingId(r.id);
                              setEditingText(r.rule);
                            }}
                          >
                            編集
                          </button>{" "}
                          <button
                            className="btn btn-outline btn-sm"
                            onClick={() => {
                              if (confirm("このルールを削除します。よろしいですか？")) {
                                act(() => request(`/api/admin/training/rules/${r.id}`, { method: "DELETE" }));
                              }
                            }}
                          >
                            削除
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}
