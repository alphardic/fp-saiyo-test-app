"use client";

import { useCallback, useEffect, useState } from "react";

interface OutlinePoint {
  key: string;
  label: string;
  summary: string;
}

interface Course {
  id: string;
  name: string;
  description: string | null;
  target_audience: string | null;
  source_notes: string;
  outline: OutlinePoint[];
  variants_per_point: number;
  status: "draft" | "pending" | "rejected" | "active" | "archived";
  review_comment: string | null;
  submitted_at: string | null;
  decided_at: string | null;
  decided_by: string | null;
}

interface Question {
  id: string;
  group_key: string;
  group_label: string;
  question: string;
  choices: string[];
  answer: string;
  explanation: string;
}

interface Feedback {
  id: string;
  question_id: string | null;
  kind: "comment" | "manual_edit";
  comment: string | null;
  created_by: string | null;
  created_at: string;
  learned_rule_id: string | null;
}

interface Detail {
  viewer: "author" | "admin";
  canEdit: boolean;
  authorName: string | null;
  course: Course;
  questions: Question[];
  feedback: Feedback[];
}

const STATUS_LABEL: Record<Course["status"], string> = {
  draft: "作成中",
  pending: "承認待ち",
  rejected: "差し戻し",
  active: "承認済み(受験に使用中)",
  archived: "アーカイブ",
};

const LETTERS = ["A", "B", "C", "D"];
const stripLetter = (c: string) => c.replace(/^[A-D][.．]\s*/, "");

export default function TrainingCourseEditor(props: {
  courseId: string;
  getHeaders: () => Promise<Record<string, string>>;
  backHref: string;
  backLabel: string;
}) {
  const { courseId, getHeaders } = props;
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error" | "info"; text: string } | null>(
    null
  );

  // 編集中の値
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [variants, setVariants] = useState(3);
  const [notes, setNotes] = useState("");
  const [outline, setOutline] = useState<OutlinePoint[]>([]);
  const [outlineDirty, setOutlineDirty] = useState(false);
  const [pointCount, setPointCount] = useState(20);
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(
    null
  );
  const [decisionComment, setDecisionComment] = useState("");

  const api = useCallback(
    async (path: string, init?: RequestInit & { json?: unknown }) => {
      const headers = await getHeaders();
      const res = await fetch(`/api/training/authoring/courses/${courseId}${path}`, {
        ...init,
        headers: {
          ...headers,
          ...(init?.json !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "処理に失敗しました。");
      return body;
    },
    [courseId, getHeaders]
  );

  const load = useCallback(async () => {
    try {
      const d = (await api("")) as Detail;
      setDetail(d);
      setName(d.course.name);
      setDescription(d.course.description ?? "");
      setTargetAudience(d.course.target_audience ?? "");
      setVariants(d.course.variants_per_point);
      setNotes(d.course.source_notes);
      setOutline(d.course.outline);
      setOutlineDirty(false);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "読み込みに失敗しました。");
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setMessage(null);
    try {
      await fn();
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "処理に失敗しました。" });
    } finally {
      setBusy(null);
    }
  }

  function showLearned(rule: string | null, prefix: string) {
    setMessage({
      type: "success",
      text: rule ? `${prefix}\n今回の指摘から次のルールを学習しました:「${rule}」` : prefix,
    });
  }

  if (loadError) {
    return (
      <main className="page page-narrow">
        <div className="card">
          <div className="alert alert-error">{loadError}</div>
        </div>
      </main>
    );
  }
  if (!detail) {
    return (
      <main className="page">
        <p className="text-muted">読み込み中...</p>
      </main>
    );
  }

  const { course, questions, canEdit, viewer } = detail;
  const questionsByPoint = (key: string) => questions.filter((q) => q.group_key === key);
  const savedOutline = course.outline;
  const missingPoints = savedOutline.filter((p) => questionsByPoint(p.key).length === 0);

  async function saveBasics() {
    await run("basics", async () => {
      await api("", {
        method: "PATCH",
        json: { name, description, targetAudience, variantsPerPoint: variants },
      });
      await load();
      setMessage({ type: "success", text: "テストの概要を保存しました。" });
    });
  }

  async function saveNotes() {
    await run("notes", async () => {
      await api("", { method: "PATCH", json: { sourceNotes: notes } });
      await load();
      setMessage({ type: "success", text: "資料ノートを保存しました。" });
    });
  }

  async function uploadPdf(file: File) {
    if (notes !== course.source_notes) {
      if (!confirm("資料ノートに保存していない変更があります。先に保存しないと失われます。続けますか？")) return;
    }
    await run("pdf", async () => {
      const form = new FormData();
      form.append("file", file);
      const headers = await getHeaders();
      const res = await fetch(`/api/training/authoring/courses/${courseId}/source`, {
        method: "POST",
        headers,
        body: form,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "資料の読み込みに失敗しました。");
      await load();
      setMessage({ type: "success", text: `「${file.name}」の要点を資料ノートに追加しました。内容を確認してください。` });
    });
  }

  async function proposeOutline() {
    if (outline.length > 0 && !confirm("いまの知識ポイントをAIの案で置き換えます。よろしいですか？(保存するまで確定しません)")) {
      return;
    }
    await run("outline", async () => {
      const body = (await api("/outline", { method: "POST", json: { pointCount } })) as {
        points: OutlinePoint[];
      };
      setOutline(body.points);
      setOutlineDirty(true);
      setMessage({ type: "info", text: "知識ポイントの案ができました。内容を確認・修正して「知識ポイントを保存」を押してください。" });
    });
  }

  async function saveOutline() {
    const removed = savedOutline.filter(
      (p) => !outline.some((o) => o.key === p.key) && questionsByPoint(p.key).length > 0
    );
    if (
      removed.length > 0 &&
      !confirm(`次の知識ポイントの問題も削除されます: ${removed.map((p) => p.label).join("、")}\nよろしいですか？`)
    ) {
      return;
    }
    await run("outline-save", async () => {
      await api("", { method: "PATCH", json: { outline } });
      await load();
      setMessage({ type: "success", text: "知識ポイントを保存しました。" });
    });
  }

  function updatePoint(index: number, patch: Partial<OutlinePoint>) {
    setOutline((cur) => cur.map((p, i) => (i === index ? { ...p, ...patch } : p)));
    setOutlineDirty(true);
  }

  function movePoint(index: number, delta: number) {
    setOutline((cur) => {
      const next = [...cur];
      const j = index + delta;
      if (j < 0 || j >= next.length) return cur;
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
    setOutlineDirty(true);
  }

  async function generatePoints(points: OutlinePoint[], instruction?: string) {
    if (outlineDirty) {
      setMessage({ type: "error", text: "先に「知識ポイントを保存」を押してください。" });
      return;
    }
    await run("generate", async () => {
      const failed: string[] = [];
      for (let i = 0; i < points.length; i++) {
        setProgress({ done: i, total: points.length, label: points[i].label });
        try {
          await api(`/points/${points[i].key}/generate`, { method: "POST", json: { instruction } });
        } catch (e) {
          failed.push(`${points[i].label}(${e instanceof Error ? e.message : "失敗"})`);
        }
      }
      setProgress(null);
      await load();
      setMessage(
        failed.length > 0
          ? { type: "error", text: `作れなかった知識ポイントがあります: ${failed.join("、")}` }
          : { type: "success", text: "問題を作成しました。1問ずつ確認し、気になる点は「指摘して直す」を使ってください。" }
      );
    });
  }

  async function submitForApproval() {
    if (!confirm("承認を申請します。申請中は編集できなくなります。よろしいですか？")) return;
    await run("submit", async () => {
      await api("/submit", { method: "POST", json: {} });
      await load();
      setMessage({ type: "success", text: "承認を申請しました。結果はメールでお知らせします。" });
    });
  }

  async function decide(decision: "approve" | "reject") {
    if (decision === "reject" && !decisionComment.trim()) {
      setMessage({ type: "error", text: "差し戻す理由を入力してください。" });
      return;
    }
    const ok = confirm(
      decision === "approve"
        ? "このテストを承認し、受験に使える状態にします。よろしいですか？"
        : "このテストを作成者に差し戻します。よろしいですか？"
    );
    if (!ok) return;
    await run("decision", async () => {
      await api("/decision", { method: "POST", json: { decision, comment: decisionComment } });
      await load();
      setDecisionComment("");
      setMessage({
        type: "success",
        text: decision === "approve" ? "承認しました。「分野別社内テスト」画面から受講者を招待できます。" : "差し戻しました。",
      });
    });
  }

  async function deleteCourse() {
    if (!confirm(`「${course.name}」を削除します。元に戻せません。よろしいですか？`)) return;
    await run("delete", async () => {
      await api("", { method: "DELETE" });
      window.location.href = props.backHref;
    });
  }

  const disabled = !canEdit || busy !== null;

  return (
    <main className="page page-wide">
      <div className="page-header">
        <a href={props.backHref} className="text-muted" style={{ fontSize: 13 }}>
          ← {props.backLabel}
        </a>
        <h1 style={{ marginTop: 8 }}>{course.name}</h1>
        <p>
          状態: <strong>{STATUS_LABEL[course.status]}</strong>
          {detail.authorName ? ` ／ 作成者: ${detail.authorName}` : ""}
        </p>
      </div>

      {course.review_comment && (
        <div
          className={`alert ${course.status === "rejected" ? "alert-error" : "alert-info"}`}
          style={{ marginBottom: 16, whiteSpace: "pre-wrap" }}
        >
          {course.status === "rejected" ? "差し戻しコメント" : "承認者コメント"}
          {course.decided_by ? `(${course.decided_by})` : ""}: {course.review_comment}
        </div>
      )}
      {course.status === "pending" && viewer === "author" && (
        <div className="alert alert-info" style={{ marginBottom: 16 }}>
          承認申請中です。承認されると受験に使えるようになります。差し戻された場合は、ここで修正して再申請できます。
        </div>
      )}

      {message && (
        <div
          className={`alert alert-${message.type}`}
          style={{ marginBottom: 16, whiteSpace: "pre-wrap", position: "sticky", top: 8, zIndex: 5 }}
        >
          {message.text}
        </div>
      )}
      {progress && (
        <div className="alert alert-info" style={{ marginBottom: 16, position: "sticky", top: 8, zIndex: 5 }}>
          問題を作成中… {progress.done + 1} / {progress.total}「{progress.label}」(1ポイントあたり30秒〜1分ほどかかります。この画面を閉じないでください)
        </div>
      )}

      {/* 1. テストの概要 */}
      <div className="section">
        <div className="section-title">
          <span className="dot" />
          <h2>1. テストの概要</h2>
        </div>
        <div className="card">
          <div className="field">
            <label>テスト名</label>
            <input value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} />
          </div>
          <div className="field">
            <label>目的・説明(受験者にも表示されます)</label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={!canEdit}
            />
          </div>
          <div className="field">
            <label>受験対象者(例: MUJIハウスから紹介を受けた顧客を担当するFP)</label>
            <input value={targetAudience} onChange={(e) => setTargetAudience(e.target.value)} disabled={!canEdit} />
          </div>
          <div className="field" style={{ maxWidth: 260 }}>
            <label>1つの知識ポイントあたりの問題パターン数</label>
            <select value={variants} onChange={(e) => setVariants(Number(e.target.value))} disabled={!canEdit}>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}パターン{n === 3 ? "(おすすめ)" : ""}
                </option>
              ))}
            </select>
          </div>
          {canEdit && (
            <button className="btn btn-primary btn-sm" onClick={saveBasics} disabled={disabled}>
              {busy === "basics" ? "保存中..." : "概要を保存"}
            </button>
          )}
        </div>
      </div>

      {/* 2. 資料 */}
      <div className="section">
        <div className="section-title">
          <span className="dot" />
          <h2>2. 資料</h2>
        </div>
        <div className="card">
          <p className="text-muted" style={{ fontSize: 13, marginTop: 0 }}>
            問題の根拠になる資料です。PDFを読み込むとAIが要点をまとめて下のノートに追加します。テキストを直接貼り付けることもできます。
            AIはこのノートに書かれた内容をもとに問題を作ります。
          </p>
          {canEdit && (
            <div style={{ marginBottom: 12 }}>
              <label className="btn btn-outline btn-sm" style={{ cursor: disabled ? "not-allowed" : "pointer" }}>
                {busy === "pdf" ? "AIが資料を読んでいます…(1〜3分)" : "PDFを読み込む(10MBまで)"}
                <input
                  type="file"
                  accept="application/pdf"
                  style={{ display: "none" }}
                  disabled={disabled}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) uploadPdf(f);
                  }}
                />
              </label>
            </div>
          )}
          <div className="field">
            <label>資料ノート</label>
            <textarea
              rows={14}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={!canEdit}
              style={{ fontFamily: "inherit", fontSize: 13 }}
            />
          </div>
          {canEdit && (
            <button
              className="btn btn-primary btn-sm"
              onClick={saveNotes}
              disabled={disabled || notes === course.source_notes}
            >
              {busy === "notes" ? "保存中..." : "資料ノートを保存"}
            </button>
          )}
        </div>
      </div>

      {/* 3. 知識ポイント */}
      <div className="section">
        <div className="section-title">
          <span className="dot" />
          <h2>3. 知識ポイント</h2>
        </div>
        <div className="card">
          <p className="text-muted" style={{ fontSize: 13, marginTop: 0 }}>
            テストで確認する知識の単位です。知識ポイントごとに複数パターンの問題を作り、受験のたびにランダムで1問ずつ出題します(出題数 = 知識ポイントの数)。
          </p>
          {canEdit && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
              <span style={{ fontSize: 13 }}>知識ポイント数</span>
              <input
                type="number"
                min={3}
                max={40}
                value={pointCount}
                onChange={(e) => setPointCount(Number(e.target.value))}
                style={{ width: 80 }}
                disabled={disabled}
              />
              <button className="btn btn-outline btn-sm" onClick={proposeOutline} disabled={disabled}>
                {busy === "outline" ? "AIが考えています…" : "AIに案を作ってもらう"}
              </button>
            </div>
          )}

          {outline.length === 0 ? (
            <p className="text-muted">まだ知識ポイントがありません。</p>
          ) : (
            outline.map((p, i) => (
              <div
                key={p.key || `new-${i}`}
                style={{ display: "flex", gap: 8, alignItems: "flex-start", borderTop: i ? "1px solid #e2e8f0" : "none", padding: "8px 0" }}
              >
                <span className="text-muted" style={{ width: 24, paddingTop: 8 }}>
                  {i + 1}
                </span>
                <div style={{ flex: 1 }}>
                  <input
                    value={p.label}
                    onChange={(e) => updatePoint(i, { label: e.target.value })}
                    disabled={!canEdit}
                    style={{ fontWeight: 600, marginBottom: 4 }}
                  />
                  <input
                    value={p.summary}
                    onChange={(e) => updatePoint(i, { summary: e.target.value })}
                    disabled={!canEdit}
                    placeholder="何を問うか"
                    style={{ fontSize: 13 }}
                  />
                </div>
                {canEdit && (
                  <div style={{ display: "flex", gap: 4 }}>
                    <button className="btn btn-outline btn-sm" onClick={() => movePoint(i, -1)} disabled={disabled}>
                      ↑
                    </button>
                    <button className="btn btn-outline btn-sm" onClick={() => movePoint(i, 1)} disabled={disabled}>
                      ↓
                    </button>
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => {
                        setOutline((cur) => cur.filter((_, j) => j !== i));
                        setOutlineDirty(true);
                      }}
                      disabled={disabled}
                    >
                      削除
                    </button>
                  </div>
                )}
              </div>
            ))
          )}

          {canEdit && (
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button
                className="btn btn-outline btn-sm"
                onClick={() => {
                  setOutline((cur) => [...cur, { key: "", label: "", summary: "" }]);
                  setOutlineDirty(true);
                }}
                disabled={disabled}
              >
                ＋ 知識ポイントを追加
              </button>
              <button className="btn btn-primary btn-sm" onClick={saveOutline} disabled={disabled || !outlineDirty}>
                {busy === "outline-save" ? "保存中..." : "知識ポイントを保存"}
              </button>
              {outlineDirty && <span style={{ color: "var(--color-error)", fontSize: 13, alignSelf: "center" }}>未保存の変更があります</span>}
            </div>
          )}
        </div>
      </div>

      {/* 4. 問題 */}
      <div className="section">
        <div className="section-title">
          <span className="dot" />
          <h2>4. 問題</h2>
        </div>
        {canEdit && savedOutline.length > 0 && (
          <div className="card" style={{ marginBottom: 12 }}>
            <p style={{ marginTop: 0, fontSize: 13 }}>
              問題作成済み: {savedOutline.length - missingPoints.length} / {savedOutline.length} 知識ポイント(全{questions.length}問)
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {missingPoints.length > 0 && (
                <button className="btn btn-primary btn-sm" onClick={() => generatePoints(missingPoints)} disabled={disabled}>
                  未作成の{missingPoints.length}ポイントの問題を作る
                </button>
              )}
              {questions.length > 0 && (
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => {
                    if (confirm("すべての問題を作り直します。手で直した内容も上書きされます。よろしいですか？")) {
                      generatePoints(savedOutline);
                    }
                  }}
                  disabled={disabled}
                >
                  すべて作り直す
                </button>
              )}
            </div>
          </div>
        )}

        {savedOutline.map((p, i) => (
          <div className="card" key={p.key} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <div>
                <strong>
                  {i + 1}. {p.label}
                </strong>
                <div className="text-muted" style={{ fontSize: 13 }}>
                  {p.summary}
                </div>
              </div>
              {canEdit && (
                <button
                  className="btn btn-outline btn-sm"
                  disabled={disabled}
                  onClick={() => {
                    const instruction = prompt(
                      "このポイントの問題を作り直します。AIへの追加指示があれば入力してください(空欄でもOK)。\n既存の問題は置き換わります。"
                    );
                    if (instruction !== null) generatePoints([p], instruction);
                  }}
                >
                  このポイントを作り直す
                </button>
              )}
            </div>
            {questionsByPoint(p.key).length === 0 ? (
              <p className="text-muted" style={{ marginBottom: 0 }}>
                まだ問題がありません。
              </p>
            ) : (
              questionsByPoint(p.key).map((q, qi) => (
                <QuestionItem
                  key={q.id}
                  index={qi + 1}
                  question={q}
                  feedbackCount={detail.feedback.filter((f) => f.question_id === q.id).length}
                  canEdit={canEdit}
                  disabled={disabled}
                  hasSiblings={questionsByPoint(p.key).length > 1}
                  onComment={(comment, applyToGroup) =>
                    run(`q-${q.id}`, async () => {
                      const body = (await api(`/questions/${q.id}/feedback`, {
                        method: "POST",
                        json: { comment, applyToGroup },
                      })) as { revisedCount: number; learnedRule: string | null };
                      await load();
                      showLearned(body.learnedRule, `指摘を反映して${body.revisedCount}問を修正しました。`);
                    })
                  }
                  onEdit={(draft, reason) =>
                    run(`q-${q.id}`, async () => {
                      const body = (await api(`/questions/${q.id}`, {
                        method: "PATCH",
                        json: { ...draft, reason },
                      })) as { learnedRule: string | null };
                      await load();
                      showLearned(body.learnedRule, "問題を保存しました。");
                    })
                  }
                  onDelete={() =>
                    run(`q-${q.id}`, async () => {
                      await api(`/questions/${q.id}`, { method: "DELETE" });
                      await load();
                    })
                  }
                  busy={busy === `q-${q.id}`}
                />
              ))
            )}
          </div>
        ))}
      </div>

      {/* 5. 承認 */}
      <div className="section">
        <div className="section-title">
          <span className="dot" />
          <h2>5. 承認</h2>
        </div>
        <div className="card">
          {viewer === "author" && (course.status === "draft" || course.status === "rejected") && (
            <>
              <p style={{ marginTop: 0, fontSize: 13 }}>
                すべての問題を確認したら、上司に承認を申請してください。承認されると、受験に使えるようになります。
              </p>
              <button
                className="btn btn-primary"
                onClick={submitForApproval}
                disabled={disabled || missingPoints.length > 0 || savedOutline.length === 0 || outlineDirty}
              >
                {busy === "submit" ? "申請中..." : course.status === "rejected" ? "修正して再申請する" : "承認を申請する"}
              </button>
              {missingPoints.length > 0 && (
                <p className="text-muted" style={{ fontSize: 13 }}>
                  問題が未作成の知識ポイントがあるため、まだ申請できません。
                </p>
              )}
            </>
          )}
          {viewer === "admin" && course.status === "pending" && (
            <>
              <p style={{ marginTop: 0, fontSize: 13 }}>
                問題を確認し、直したい点は各問題の「指摘して直す」「手で編集」で修正できます(指摘は作問ルールとして学習されます)。
              </p>
              <div className="field">
                <label>コメント(差し戻す場合は必須。作成者にメールで届きます)</label>
                <textarea rows={3} value={decisionComment} onChange={(e) => setDecisionComment(e.target.value)} />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-primary" onClick={() => decide("approve")} disabled={busy !== null}>
                  承認する
                </button>
                <button className="btn btn-outline" onClick={() => decide("reject")} disabled={busy !== null}>
                  差し戻す
                </button>
              </div>
            </>
          )}
          {course.status === "pending" && viewer === "author" && <p className="text-muted">承認待ちです。</p>}
          {viewer === "admin" && course.status !== "pending" && course.status !== "active" && (
            <p className="text-muted" style={{ marginTop: 0 }}>
              作成者がまだ承認申請していません。
            </p>
          )}
          {course.status === "active" && <p className="text-muted">承認済みです。</p>}
          {canEdit && (
            <div style={{ marginTop: 24, borderTop: "1px solid #e2e8f0", paddingTop: 12 }}>
              <button className="btn btn-outline btn-sm" onClick={deleteCourse} disabled={disabled}>
                このテストを削除
              </button>
            </div>
          )}
        </div>
      </div>

      {detail.feedback.length > 0 && (
        <div className="section">
          <div className="section-title">
            <span className="dot" />
            <h2>指摘・修正の履歴({detail.feedback.length}件)</h2>
          </div>
          <div className="card" style={{ padding: 0 }}>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>日時</th>
                    <th>誰が</th>
                    <th>種類</th>
                    <th>内容</th>
                    <th>学習</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.feedback.map((f) => (
                    <tr key={f.id}>
                      <td className="text-muted" style={{ whiteSpace: "nowrap" }}>
                        {new Date(f.created_at).toLocaleString("ja-JP")}
                      </td>
                      <td>{f.created_by}</td>
                      <td>{f.kind === "comment" ? "指摘" : "手で編集"}</td>
                      <td style={{ whiteSpace: "pre-wrap" }}>{f.comment || "-"}</td>
                      <td>{f.learned_rule_id ? "ルール化" : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function QuestionItem(props: {
  index: number;
  question: Question;
  feedbackCount: number;
  canEdit: boolean;
  disabled: boolean;
  hasSiblings: boolean;
  busy: boolean;
  onComment: (comment: string, applyToGroup: boolean) => void;
  onEdit: (
    draft: { question: string; choices: string[]; answer: string; explanation: string },
    reason: string
  ) => void;
  onDelete: () => void;
}) {
  const q = props.question;
  const [mode, setMode] = useState<"view" | "comment" | "edit">("view");
  const [comment, setComment] = useState("");
  const [applyToGroup, setApplyToGroup] = useState(true);
  const [draftQuestion, setDraftQuestion] = useState(q.question);
  const [draftChoices, setDraftChoices] = useState(q.choices.map(stripLetter));
  const [draftAnswer, setDraftAnswer] = useState(q.answer);
  const [draftExplanation, setDraftExplanation] = useState(q.explanation);
  const [reason, setReason] = useState("");

  useEffect(() => {
    setMode("view");
    setComment("");
    setReason("");
    setDraftQuestion(q.question);
    setDraftChoices(q.choices.map(stripLetter));
    setDraftAnswer(q.answer);
    setDraftExplanation(q.explanation);
  }, [q]);

  return (
    <div style={{ borderTop: "1px solid #e2e8f0", marginTop: 12, paddingTop: 12 }}>
      <div className="text-muted" style={{ fontSize: 12, marginBottom: 4 }}>
        パターン{props.index}
        {props.feedbackCount > 0 ? ` ・ 指摘/修正 ${props.feedbackCount}回` : ""}
      </div>

      {mode === "edit" ? (
        <div>
          <div className="field">
            <label>問題文</label>
            <textarea rows={3} value={draftQuestion} onChange={(e) => setDraftQuestion(e.target.value)} />
          </div>
          {draftChoices.map((c, i) => (
            <div className="field" key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>
                <input
                  type="radio"
                  checked={draftAnswer === LETTERS[i]}
                  onChange={() => setDraftAnswer(LETTERS[i])}
                />
                {LETTERS[i]}
              </label>
              <input
                value={c}
                onChange={(e) => setDraftChoices((cur) => cur.map((x, j) => (j === i ? e.target.value : x)))}
              />
            </div>
          ))}
          <p className="text-muted" style={{ fontSize: 12, marginTop: 0 }}>
            ◉ が付いた選択肢が正解です。
          </p>
          <div className="field">
            <label>解説</label>
            <textarea rows={4} value={draftExplanation} onChange={(e) => setDraftExplanation(e.target.value)} />
          </div>
          <div className="field">
            <label>直した理由(任意。書くとAIが今後の作問ルールとして学びやすくなります)</label>
            <input value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn btn-primary btn-sm"
              disabled={props.disabled}
              onClick={() =>
                props.onEdit(
                  {
                    question: draftQuestion,
                    choices: draftChoices.map((c, i) => `${LETTERS[i]}. ${c.trim()}`),
                    answer: draftAnswer,
                    explanation: draftExplanation,
                  },
                  reason
                )
              }
            >
              {props.busy ? "保存中..." : "保存"}
            </button>
            <button className="btn btn-outline btn-sm" onClick={() => setMode("view")} disabled={props.disabled}>
              キャンセル
            </button>
          </div>
        </div>
      ) : (
        <>
          <p style={{ whiteSpace: "pre-wrap", margin: "0 0 8px" }}>{q.question}</p>
          <ul style={{ listStyle: "none", padding: 0, margin: "0 0 8px" }}>
            {q.choices.map((c, i) => {
              const correct = LETTERS[i] === q.answer;
              return (
                <li
                  key={i}
                  style={{
                    padding: "4px 8px",
                    marginBottom: 4,
                    borderRadius: 6,
                    background: correct ? "rgba(26,127,55,0.10)" : "transparent",
                    fontWeight: correct ? 600 : 400,
                  }}
                >
                  {correct ? "✓ " : ""}
                  {c}
                </li>
              );
            })}
          </ul>
          <div className="text-muted" style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>
            解説: {q.explanation}
          </div>

          {mode === "comment" && (
            <div style={{ marginTop: 12 }}>
              <div className="field">
                <label>指摘内容(どこがどうおかしいか。AIが問題を直し、今後の作問にも活かします)</label>
                <textarea
                  rows={3}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="例: 正解の選択肢だけ数字が細かくて、知識がなくても当てられてしまう"
                />
              </div>
              {props.hasSiblings && (
                <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, marginBottom: 8 }}>
                  <input type="checkbox" checked={applyToGroup} onChange={(e) => setApplyToGroup(e.target.checked)} />
                  同じ知識ポイントのほかのパターンにも同じ問題があれば直す
                </label>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className="btn btn-primary btn-sm"
                  disabled={props.disabled || !comment.trim()}
                  onClick={() => props.onComment(comment.trim(), props.hasSiblings && applyToGroup)}
                >
                  {props.busy ? "AIが修正しています…(30秒〜1分)" : "この指摘で直す"}
                </button>
                <button className="btn btn-outline btn-sm" onClick={() => setMode("view")} disabled={props.disabled}>
                  キャンセル
                </button>
              </div>
            </div>
          )}

          {props.canEdit && mode === "view" && (
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button className="btn btn-outline btn-sm" onClick={() => setMode("comment")} disabled={props.disabled}>
                指摘して直す
              </button>
              <button className="btn btn-outline btn-sm" onClick={() => setMode("edit")} disabled={props.disabled}>
                手で編集
              </button>
              <button
                className="btn btn-outline btn-sm"
                onClick={() => {
                  if (confirm("この問題を削除します。よろしいですか？")) props.onDelete();
                }}
                disabled={props.disabled}
              >
                削除
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
