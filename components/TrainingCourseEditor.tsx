"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

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
  published_at: string | null;
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

interface Reviewer {
  id: string;
  employeeId: string;
  name: string;
  email: string | null;
  status: "requested" | "done";
  comment: string | null;
  requestedAt: string;
  doneAt: string | null;
}

interface Detail {
  viewer: "owner" | "reviewer" | "admin";
  canEdit: boolean;
  canEditQuestions: boolean;
  myEmployeeId: string | null;
  authorName: string | null;
  course: Course;
  questions: Question[];
  feedback: Feedback[];
  reviewers: Reviewer[];
  registerPath: string | null;
  isOwnCourseAsAdmin?: boolean;
}

const STATUS_LABEL: Record<Course["status"], string> = {
  draft: "作成中",
  pending: "承認待ち",
  rejected: "差し戻し",
  active: "配布中",
  archived: "終了",
};

const STEPS = [
  { key: "overview", label: "1. 概要" },
  { key: "source", label: "2. 資料" },
  { key: "points", label: "3. 知識ポイント" },
  { key: "questions", label: "4. 問題" },
  { key: "publish", label: "5. 確認・配布" },
  { key: "results", label: "6. 受験結果" },
] as const;

export type EditorStep = (typeof STEPS)[number]["key"];

export function parseStep(value: string | null): EditorStep {
  return (STEPS.find((s) => s.key === value)?.key ?? "overview") as EditorStep;
}

const LETTERS = ["A", "B", "C", "D"];
const stripLetter = (c: string) => c.replace(/^[A-D][.．]\s*/, "");

export default function TrainingCourseEditor(props: {
  courseId: string;
  step: EditorStep;
  basePath: string;
  getHeaders: () => Promise<Record<string, string>>;
  backHref: string;
  backLabel: string;
  loginHref: string;
}) {
  const { courseId, getHeaders, step } = props;
  const router = useRouter();
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
  const [reviewerChoice, setReviewerChoice] = useState(""); // 社員ID or "other"
  const [reviewerEmail, setReviewerEmail] = useState("");
  const [reviewerName, setReviewerName] = useState("");
  const [candidates, setCandidates] = useState<{ id: string; name: string; email: string }[]>([]);
  const [lastRequested, setLastRequested] = useState<string | null>(null);
  const [reviewComment, setReviewComment] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

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
      const text = await res.text();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let body: any = {};
      try {
        body = JSON.parse(text);
      } catch {
        // サーバーがJSON以外(タイムアウト時のエラーページ等)を返した場合
      }
      if (!res.ok) {
        throw new Error(
          body.error || `処理に失敗しました(エラーコード ${res.status}: ${text.replace(/<[^>]+>/g, " ").trim().slice(0, 150)})`
        );
      }
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

  // ページ(ステップ)を移ったら、前のページのお知らせは消す
  useEffect(() => {
    setMessage(null);
    setLastRequested(null);
    window.scrollTo({ top: 0 });
  }, [step]);

  // 確認をお願いできる社員の候補(作成者が「確認・配布」ページを開いたときだけ読む)
  const isOwner = detail?.viewer === "owner";
  useEffect(() => {
    if (step !== "publish" || !isOwner) return;
    api("/reviewers")
      .then((b: { candidates: { id: string; name: string; email: string }[] }) => setCandidates(b.candidates ?? []))
      .catch(() => setCandidates([]));
  }, [step, isOwner, api]);

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

  async function copyText(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      prompt("次の内容をコピーしてください:", text);
    }
  }

  if (loadError) {
    const needsLogin = /ログイン/.test(loadError);
    return (
      <main className="page page-narrow">
        <div className="card">
          <div className="alert alert-error">{loadError}</div>
          {needsLogin && (
            <a href={props.loginHref} className="btn btn-primary" style={{ marginTop: 12 }}>
              ログインページへ
            </a>
          )}
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

  const { course, questions, canEdit, canEditQuestions, viewer } = detail;
  const questionsByPoint = (key: string) => questions.filter((q) => q.group_key === key);
  const savedOutline = course.outline;
  const missingPoints = savedOutline.filter((p) => questionsByPoint(p.key).length === 0);
  const basicsDirty =
    name !== course.name ||
    description !== (course.description ?? "") ||
    targetAudience !== (course.target_audience ?? "") ||
    variants !== course.variants_per_point;
  const notesDirty = notes !== course.source_notes;
  const myReview = detail.reviewers.find((r) => r.employeeId === detail.myEmployeeId) ?? null;
  const registerUrl =
    detail.registerPath && typeof window !== "undefined" ? window.location.origin + detail.registerPath : null;

  const visibleSteps = STEPS.filter((s) => !(s.key === "results" && viewer === "reviewer"));
  const stepDone: Record<EditorStep, boolean> = {
    overview: !!course.name,
    source: !!course.source_notes.trim(),
    points: savedOutline.length > 0,
    questions: savedOutline.length > 0 && missingPoints.length === 0,
    publish: course.status === "active",
    results: false,
  };
  const stepIndex = visibleSteps.findIndex((s) => s.key === step);
  const prevStep = stepIndex > 0 ? visibleSteps[stepIndex - 1] : null;
  const nextStep = stepIndex >= 0 && stepIndex < visibleSteps.length - 1 ? visibleSteps[stepIndex + 1] : null;

  function goTo(target: EditorStep) {
    const dirty =
      (step === "overview" && basicsDirty) || (step === "source" && notesDirty) || (step === "points" && outlineDirty);
    if (dirty && canEdit && !confirm("保存していない変更があります。このページを離れると失われます。移動しますか？")) {
      return;
    }
    if (dirty) {
      // 保存せずに移動する場合は、保存済みの内容に戻す
      setName(course.name);
      setDescription(course.description ?? "");
      setTargetAudience(course.target_audience ?? "");
      setVariants(course.variants_per_point);
      setNotes(course.source_notes);
      setOutline(course.outline);
      setOutlineDirty(false);
    }
    router.push(`${props.basePath}?step=${target}`);
  }

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
    if (notesDirty) {
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
      setMessage({
        type: "success",
        text: `「${file.name}」の要点を資料ノートに追加し、保存しました。内容を確認し、よければ「次へ」に進んでください。`,
      });
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

  async function publish() {
    if (
      !confirm(
        "配布を始めます。配布を始めると、問題の編集はできなくなります。\n(確認を頼んだ人がまだ確認していなくても配布できます)\nよろしいですか？"
      )
    ) {
      return;
    }
    await run("publish", async () => {
      await api("/publish", { method: "POST", json: {} });
      await load();
      setMessage({ type: "success", text: "配布を始めました。下の案内文をコピーして、LINE WORKSやメールで受験してほしい人に送ってください。" });
    });
  }

  async function requestReview() {
    const json =
      reviewerChoice === "other"
        ? { email: reviewerEmail.trim(), name: reviewerName.trim() }
        : { employeeId: reviewerChoice };
    await run("review-request", async () => {
      const body = (await api("/reviewers", { method: "POST", json })) as { reviewerName: string };
      setReviewerChoice("");
      setReviewerEmail("");
      setReviewerName("");
      setLastRequested(body.reviewerName);
      await load();
    });
  }

  async function cancelReview(r: Reviewer) {
    if (!confirm(`${r.name}さんへの確認の依頼を取り消します。よろしいですか？`)) return;
    await run("review-cancel", async () => {
      await api(`/reviewers?id=${r.id}`, { method: "DELETE" });
      await load();
    });
  }

  async function completeReview() {
    await run("review-done", async () => {
      await api("/review", { method: "POST", json: { comment: reviewComment } });
      setReviewComment("");
      await load();
      setMessage({ type: "success", text: "確認済みとして記録しました。ありがとうございました。" });
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
        text: decision === "approve" ? "承認しました。" : "差し戻しました。",
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
  const portalUrl = typeof window !== "undefined" ? window.location.origin + "/training/portal" : "";
  const reviewRequestText = `社内テスト「${course.name}」を作りました。配布の前に、問題の確認をお願いします。

1. 次のページを開いてください。
${portalUrl}
2. 初めての場合は「はじめての方(新規登録)」を押し、会社のメールアドレスで登録してください。
3. ログイン後、「確認を頼まれたテスト」の「確認する」を押してください。
4. 気になる問題は「指摘して直す」で直し、最後に「5. 確認・配布」で「確認しました」を押してください。`;
  const distributionText = registerUrl
    ? `社内テスト「${course.name}」を作りました。\n次のリンクを開き、氏名と会社のメールアドレスを入力して受験してください。\n${registerUrl}`
    : "";

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
          {viewer === "reviewer" ? " ／ あなたは確認を頼まれています" : ""}
        </p>
      </div>

      {detail.isOwnCourseAsAdmin && (
        <div className="alert alert-info" style={{ marginBottom: 16 }}>
          あなたが作ったテストを、管理画面で開いています(ここでは見るだけです)。確認の依頼と配布は、社員用ページで行います。
          <div style={{ marginTop: 8 }}>
            <a href={`/training/portal/course/${course.id}?step=${step}`} className="btn btn-primary btn-sm">
              社員用ページで開く(確認依頼・配布はこちら)
            </a>
          </div>
        </div>
      )}

      {/* ステップの切り替え */}
      <nav style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
        {visibleSteps.map((s) => {
          const active = s.key === step;
          return (
            <button
              key={s.key}
              className={`btn btn-sm ${active ? "btn-primary" : "btn-outline"}`}
              onClick={() => !active && goTo(s.key)}
              disabled={busy !== null && !active}
            >
              {stepDone[s.key] && !active ? "✓ " : ""}
              {s.label}
            </button>
          );
        })}
      </nav>

      {course.review_comment && course.status === "rejected" && (
        <div className="alert alert-error" style={{ marginBottom: 16, whiteSpace: "pre-wrap" }}>
          差し戻しコメント{course.decided_by ? `(${course.decided_by})` : ""}: {course.review_comment}
        </div>
      )}
      {course.status === "active" && step !== "publish" && step !== "results" && (
        <div className="alert alert-info" style={{ marginBottom: 16 }}>
          配布中のため、内容は編集できません。
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

      {step === "overview" && (
        <div className="section">
          <div className="section-title">
            <span className="dot" />
            <h2>1. テストの概要</h2>
          </div>
          <div className="card">
            <div className="field">
              <label>テスト名</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} />
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
              <input
                type="text"
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
                disabled={!canEdit}
              />
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
              <SaveButton label="概要を保存" busy={busy === "basics"} dirty={basicsDirty} disabled={disabled} onClick={saveBasics} />
            )}
          </div>
        </div>
      )}

      {step === "source" && (
        <div className="section">
          <div className="section-title">
            <span className="dot" />
            <h2>2. 資料</h2>
          </div>
          <div className="card">
            <p className="text-muted" style={{ fontSize: 13, marginTop: 0 }}>
              問題の根拠になる資料です。PDFを読み込むとAIが要点をまとめて下のノートに追加し、自動で保存します。テキストを直接貼り付けることもできます。
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
                rows={18}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={!canEdit}
                style={{ fontFamily: "inherit", fontSize: 13 }}
              />
            </div>
            {canEdit && (
              <SaveButton label="資料ノートを保存" busy={busy === "notes"} dirty={notesDirty} disabled={disabled} onClick={saveNotes} />
            )}
          </div>
        </div>
      )}

      {step === "points" && (
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
                      type="text"
                      value={p.label}
                      onChange={(e) => updatePoint(i, { label: e.target.value })}
                      disabled={!canEdit}
                      style={{ fontWeight: 600, marginBottom: 4 }}
                    />
                    <input
                      type="text"
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
              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
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
                <SaveButton
                  label="知識ポイントを保存"
                  busy={busy === "outline-save"}
                  dirty={outlineDirty}
                  disabled={disabled}
                  onClick={saveOutline}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {step === "questions" && (
        <div className="section">
          <div className="section-title">
            <span className="dot" />
            <h2>4. 問題</h2>
          </div>
          {viewer === "reviewer" && (
            <div className="alert alert-info" style={{ marginBottom: 12 }}>
              {detail.authorName ?? "作成者"}さんから確認を頼まれています。気になる問題は「指摘して直す」で直せます。
              確認が終わったら「5. 確認・配布」で「確認しました」を押してください。
            </div>
          )}
          {savedOutline.length === 0 && (
            <div className="card">
              <p className="text-muted" style={{ margin: 0 }}>
                先に「3. 知識ポイント」で知識ポイントを保存してください。
              </p>
            </div>
          )}
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
                    canEdit={canEditQuestions}
                    canDelete={canEdit}
                    disabled={!canEditQuestions || busy !== null}
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

          {detail.feedback.length > 0 && (
            <details className="card" style={{ marginTop: 16 }}>
              <summary style={{ cursor: "pointer", fontWeight: 600 }}>
                指摘・修正の履歴({detail.feedback.length}件)
              </summary>
              <div className="table-wrap" style={{ marginTop: 12 }}>
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
            </details>
          )}
        </div>
      )}

      {step === "publish" && (
        <>
          {/* 第三者による確認(任意) */}
          <div className="section">
            <div className="section-title">
              <span className="dot" />
              <h2>5-1. ほかの人に確認してもらう(任意)</h2>
            </div>
            <div className="card">
              {viewer === "reviewer" && myReview && (
                <div style={{ marginBottom: detail.reviewers.length > 0 ? 16 : 0 }}>
                  {myReview.status === "done" ? (
                    <div className="alert alert-success" style={{ whiteSpace: "pre-wrap" }}>
                      確認済みです({myReview.doneAt ? new Date(myReview.doneAt).toLocaleDateString("ja-JP") : ""})。
                      {myReview.comment ? `\nコメント: ${myReview.comment}` : ""}
                    </div>
                  ) : (
                    <>
                      <p style={{ marginTop: 0, fontSize: 13 }}>
                        「4. 問題」で問題を確認し、気になる点を直したら、ここで「確認しました」を押してください。作成者へのコメントも残せます。
                      </p>
                      <div className="field">
                        <label>作成者へのコメント(任意)</label>
                        <textarea rows={3} value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} />
                      </div>
                      <button className="btn btn-primary" onClick={completeReview} disabled={busy !== null}>
                        {busy === "review-done" ? "保存中..." : "確認しました"}
                      </button>
                    </>
                  )}
                </div>
              )}

              {viewer !== "reviewer" && (
                <p className="text-muted" style={{ marginTop: 0, fontSize: 13 }}>
                  配布の前に、同僚に問題の確認を頼めます。頼まれた人は問題を見て、「指摘して直す」で直したり、コメントを残したりできます。
                  確認が終わっていなくても配布はできます。
                </p>
              )}
              {viewer === "admin" && (
                <p className="text-muted" style={{ fontSize: 13 }}>
                  ※ 確認の依頼は、作成者が社員用ページで行います(管理画面からはできません)。
                </p>
              )}

              {detail.reviewers.length > 0 && (
                <div className="table-wrap" style={{ marginBottom: 12 }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>確認する人</th>
                        <th>状態</th>
                        <th>コメント</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.reviewers.map((r) => (
                        <tr key={r.id}>
                          <td>{r.name}</td>
                          <td>
                            {r.status === "done"
                              ? `確認済み(${r.doneAt ? new Date(r.doneAt).toLocaleDateString("ja-JP") : ""})`
                              : "未確認"}
                          </td>
                          <td style={{ whiteSpace: "pre-wrap" }}>{r.comment || "-"}</td>
                          <td style={{ textAlign: "right" }}>
                            {viewer === "owner" && (
                              <button
                                className="btn btn-outline btn-sm"
                                onClick={() => cancelReview(r)}
                                disabled={busy !== null}
                              >
                                取り消す
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {viewer === "owner" && course.status !== "active" && (
                <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 16 }}>
                  <p style={{ marginTop: 0, fontWeight: 600 }}>確認を依頼する</p>
                  <div className="field">
                    <label>① 確認してほしい人を選ぶ</label>
                    <select value={reviewerChoice} onChange={(e) => setReviewerChoice(e.target.value)}>
                      <option value="">選んでください</option>
                      {candidates
                        .filter((c) => !detail.reviewers.some((r) => r.employeeId === c.id))
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}({c.email})
                          </option>
                        ))}
                      <option value="other">一覧にいない人(メールアドレスを入力)</option>
                    </select>
                  </div>
                  {reviewerChoice === "other" && (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <div className="field" style={{ flex: "1 1 240px" }}>
                        <label>会社のメールアドレス</label>
                        <input
                          type="email"
                          value={reviewerEmail}
                          onChange={(e) => setReviewerEmail(e.target.value)}
                          placeholder="例: yamada@alpha-fp.com"
                        />
                      </div>
                      <div className="field" style={{ flex: "1 1 160px" }}>
                        <label>お名前</label>
                        <input
                          type="text"
                          value={reviewerName}
                          onChange={(e) => setReviewerName(e.target.value)}
                          placeholder="例: 山田 太郎"
                        />
                      </div>
                    </div>
                  )}
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>② 依頼する</label>
                    <div>
                      <button
                        className="btn btn-primary"
                        onClick={requestReview}
                        disabled={
                          busy !== null ||
                          !reviewerChoice ||
                          (reviewerChoice === "other" && (!reviewerEmail.trim() || !reviewerName.trim()))
                        }
                      >
                        {busy === "review-request" ? "依頼中..." : "確認を依頼する"}
                      </button>
                    </div>
                  </div>
                  {lastRequested && (
                    <div className="alert alert-success" style={{ marginTop: 16 }}>
                      {lastRequested}さんへの依頼を登録しました。続けて③の案内文を送ってください。
                    </div>
                  )}
                  {detail.reviewers.length > 0 && (
                    <div className="field" style={{ marginTop: 16, marginBottom: 0 }}>
                      <label>③ 案内文をコピーして、LINE WORKSやメールで相手に送る(システムからは通知が届きません)</label>
                      <textarea rows={7} readOnly value={reviewRequestText} style={{ fontSize: 13 }} />
                      <div style={{ marginTop: 8 }}>
                        <button className="btn btn-outline btn-sm" onClick={() => copyText("review", reviewRequestText)}>
                          {copied === "review" ? "コピーしました" : "案内文をコピー"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 配布 */}
          <div className="section">
            <div className="section-title">
              <span className="dot" />
              <h2>5-2. 配布</h2>
            </div>
            <div className="card">
              {course.status === "active" ? (
                <>
                  <div className="alert alert-success" style={{ marginBottom: 16 }}>
                    配布中です
                    {course.published_at ? `(${new Date(course.published_at).toLocaleDateString("ja-JP")}から)` : ""}。
                  </div>
                  {registerUrl && (
                    <>
                      <div className="field">
                        <label>① 案内文をコピーする</label>
                        <textarea rows={4} readOnly value={distributionText} style={{ fontSize: 13 }} />
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                          <button className="btn btn-primary btn-sm" onClick={() => copyText("text", distributionText)}>
                            {copied === "text" ? "コピーしました" : "案内文をコピー"}
                          </button>
                          <button className="btn btn-outline btn-sm" onClick={() => copyText("url", registerUrl)}>
                            {copied === "url" ? "コピーしました" : "リンクだけコピー"}
                          </button>
                        </div>
                      </div>
                      <div className="field">
                        <label>② LINE WORKSのトークやメールに貼り付けて、受験してほしい人に送る</label>
                        <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>
                          受け取った人はリンクを開き、氏名と会社のメールアドレスを入れるだけで受験できます(ログインは不要です)。何度でも受験できます。
                        </p>
                      </div>
                      {viewer !== "reviewer" && (
                        <div className="field" style={{ marginBottom: 0 }}>
                          <label>③ 受験結果を見る</label>
                          <div>
                            <button className="btn btn-outline btn-sm" onClick={() => goTo("results")}>
                              6. 受験結果へ
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </>
              ) : viewer === "owner" ? (
                <>
                  <p style={{ marginTop: 0, fontWeight: 600 }}>配布の流れ</p>
                  <ol style={{ fontSize: 14, paddingLeft: 20, marginTop: 0 }}>
                    <li>下の「配布を始める」を押す(押すと問題は編集できなくなります)</li>
                    <li>表示される案内文(受験用リンク入り)をコピーする</li>
                    <li>LINE WORKSのトークやメールに貼り付けて、受験してほしい人に送る</li>
                    <li>受け取った人は、リンクを開いて氏名と会社のメールアドレスを入れて受験する(ログイン不要)</li>
                    <li>結果は「6. 受験結果」で、1人ずつの点数と回答を見られる</li>
                  </ol>
                  <button
                    className="btn btn-primary"
                    onClick={publish}
                    disabled={busy !== null || missingPoints.length > 0 || savedOutline.length === 0}
                  >
                    {busy === "publish" ? "準備中..." : "配布を始める"}
                  </button>
                  {(missingPoints.length > 0 || savedOutline.length === 0) && (
                    <p className="text-muted" style={{ fontSize: 13 }}>
                      問題が作られていない知識ポイントがあるため、まだ配布できません。
                    </p>
                  )}
                  {detail.reviewers.some((r) => r.status === "requested") && (
                    <p className="text-muted" style={{ fontSize: 13 }}>
                      ※ まだ確認が終わっていない人がいます(配布は可能です)。
                    </p>
                  )}
                </>
              ) : viewer === "admin" && course.status === "pending" ? (
                <>
                  <p style={{ marginTop: 0, fontSize: 13 }}>
                    以前の仕組みで承認申請されたテストです。問題を確認し、承認または差し戻しをしてください。
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
              ) : (
                <p className="text-muted" style={{ margin: 0 }}>
                  まだ配布されていません。配布は、作成者が社員用ページで行います。
                </p>
              )}

              {canEdit && viewer !== "reviewer" && (
                <div style={{ marginTop: 24, borderTop: "1px solid #e2e8f0", paddingTop: 12 }}>
                  <button className="btn btn-outline btn-sm" onClick={deleteCourse} disabled={disabled}>
                    このテストを削除
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {step === "results" && viewer !== "reviewer" && (
        <ResultsView
          active={course.status === "active"}
          load={() => api("/results")}
          onError={(text) => setMessage({ type: "error", text })}
        />
      )}

      {/* 前へ・次へ */}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 24 }}>
        {prevStep ? (
          <button className="btn btn-outline" onClick={() => goTo(prevStep.key)} disabled={busy !== null}>
            ← {prevStep.label}
          </button>
        ) : (
          <span />
        )}
        {nextStep && !(nextStep.key === "results" && course.status !== "active") && (
          <button className="btn btn-primary" onClick={() => goTo(nextStep.key)} disabled={busy !== null}>
            次へ: {nextStep.label} →
          </button>
        )}
      </div>
    </main>
  );
}

function SaveButton(props: {
  label: string;
  busy: boolean;
  dirty: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
      <button className="btn btn-primary btn-sm" onClick={props.onClick} disabled={props.disabled || !props.dirty}>
        {props.busy ? "保存中..." : props.label}
      </button>
      {props.dirty ? (
        <span style={{ color: "var(--color-error)", fontSize: 13 }}>未保存の変更があります</span>
      ) : (
        <span className="text-muted" style={{ fontSize: 13 }}>
          ✓ 保存済み
        </span>
      )}
    </span>
  );
}

interface ResultAnswer {
  questionId: string;
  groupLabel: string;
  question: string;
  choices: string[];
  correctAnswer: string;
  answer: string | null;
  isCorrect: boolean | null;
}

interface ResultAttempt {
  id: string;
  score: number | null;
  total: number | null;
  passed: boolean | null;
  submittedAt: string | null;
  answers: ResultAnswer[];
}

interface ResultTaker {
  employeeName: string;
  employeeEmail: string | null;
  enrolledAt: string;
  attempts: ResultAttempt[];
}

function ResultsView(props: {
  active: boolean;
  load: () => Promise<{ takers: ResultTaker[]; pointStats: { label: string; answered: number; correct: number }[] }>;
  onError: (text: string) => void;
}) {
  const { active, load, onError } = props;
  const [data, setData] = useState<{
    takers: ResultTaker[];
    pointStats: { label: string; answered: number; correct: number }[];
  } | null>(null);
  const [openAttempt, setOpenAttempt] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;
    load()
      .then(setData)
      .catch((e) => onError(e instanceof Error ? e.message : "受験結果の読み込みに失敗しました。"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  if (!active) {
    return (
      <div className="card">
        <p className="text-muted" style={{ margin: 0 }}>
          配布を始めると、ここに受験結果が表示されます。
        </p>
      </div>
    );
  }
  if (!data) return <p className="text-muted">読み込み中...</p>;

  const finished = data.takers.filter((t) => t.attempts.length > 0);

  return (
    <>
      <div className="section">
        <div className="section-title">
          <span className="dot" />
          <h2>
            6. 受験結果(登録 {data.takers.length}人 / 受験済み {finished.length}人)
          </h2>
        </div>
        {data.takers.length === 0 ? (
          <div className="card">
            <p className="text-muted" style={{ margin: 0 }}>
              まだ受験者がいません。「5. 確認・配布」の配布用リンクを送ってください。
            </p>
          </div>
        ) : (
          <div className="card" style={{ padding: 0 }}>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>受験者</th>
                    <th>受験回数</th>
                    <th>最新の点数</th>
                    <th>最高点</th>
                    <th>合格</th>
                    <th>最新の受験日</th>
                  </tr>
                </thead>
                <tbody>
                  {data.takers.map((t) => {
                    const latest = t.attempts[0];
                    const best = t.attempts.reduce<ResultAttempt | null>(
                      (b, a) => (b === null || (a.score ?? 0) > (b.score ?? 0) ? a : b),
                      null
                    );
                    return (
                      <tr key={t.employeeName + t.enrolledAt}>
                        <td>
                          {t.employeeName}
                          <div className="text-muted" style={{ fontSize: 12 }}>
                            {t.employeeEmail}
                          </div>
                        </td>
                        <td>{t.attempts.length}回</td>
                        <td>{latest ? `${latest.score} / ${latest.total}` : "未受験"}</td>
                        <td>{best ? `${best.score} / ${best.total}` : "-"}</td>
                        <td>{t.attempts.some((a) => a.passed) ? "合格" : t.attempts.length > 0 ? "未合格" : "-"}</td>
                        <td className="text-muted">
                          {latest?.submittedAt ? new Date(latest.submittedAt).toLocaleString("ja-JP") : "-"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {finished.length > 0 && (
        <div className="section">
          <div className="section-title">
            <span className="dot" />
            <h2>知識ポイントごとの正答率(各受験者の最新の受験)</h2>
          </div>
          <div className="card" style={{ padding: 0 }}>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>知識ポイント</th>
                    <th>正答率</th>
                  </tr>
                </thead>
                <tbody>
                  {data.pointStats.map((p) => (
                    <tr key={p.label}>
                      <td>{p.label}</td>
                      <td>
                        {p.answered === 0
                          ? "-"
                          : `${Math.round((p.correct / p.answered) * 100)}%(${p.correct} / ${p.answered}人)`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {finished.length > 0 && (
        <div className="section">
          <div className="section-title">
            <span className="dot" />
            <h2>1人ずつの回答</h2>
          </div>
          {finished.map((t) =>
            t.attempts.map((a, ai) => (
              <div className="card" key={a.id} style={{ marginBottom: 8 }}>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => setOpenAttempt(openAttempt === a.id ? null : a.id)}
                  style={{ width: "100%", justifyContent: "space-between", display: "flex" }}
                >
                  <span>
                    {t.employeeName} ／ {t.attempts.length - ai}回目 ／ {a.score} / {a.total}
                    {a.passed ? "(合格)" : ""}
                  </span>
                  <span className="text-muted">
                    {a.submittedAt ? new Date(a.submittedAt).toLocaleString("ja-JP") : ""} {openAttempt === a.id ? "▲" : "▼"}
                  </span>
                </button>
                {openAttempt === a.id &&
                  a.answers.map((x, xi) => (
                    <div key={x.questionId} style={{ borderTop: "1px solid #e2e8f0", marginTop: 12, paddingTop: 12 }}>
                      <div className="text-muted" style={{ fontSize: 12 }}>
                        {xi + 1}. {x.groupLabel} ／ {x.isCorrect ? "正解" : "不正解"}
                      </div>
                      <p style={{ whiteSpace: "pre-wrap", margin: "4px 0 8px" }}>{x.question}</p>
                      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                        {x.choices.map((c, ci) => {
                          const letter = LETTERS[ci];
                          const isCorrect = letter === x.correctAnswer;
                          const chosen = letter === x.answer;
                          return (
                            <li
                              key={ci}
                              style={{
                                padding: "4px 8px",
                                marginBottom: 4,
                                borderRadius: 6,
                                background: isCorrect
                                  ? "rgba(26,127,55,0.10)"
                                  : chosen
                                    ? "rgba(207,34,46,0.10)"
                                    : "transparent",
                                fontWeight: isCorrect || chosen ? 600 : 400,
                              }}
                            >
                              {chosen ? "▶ " : ""}
                              {c}
                              {isCorrect ? "(正解)" : ""}
                              {chosen && !isCorrect ? "(この人の回答)" : ""}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
              </div>
            ))
          )}
        </div>
      )}
    </>
  );
}

function QuestionItem(props: {
  index: number;
  question: Question;
  feedbackCount: number;
  canEdit: boolean;
  canDelete: boolean;
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
                type="text"
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
            <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} />
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
              {props.canDelete && (
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => {
                    if (confirm("この問題を削除します。よろしいですか？")) props.onDelete();
                  }}
                  disabled={props.disabled}
                >
                  削除
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
