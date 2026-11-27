"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { portalHeaders, PORTAL_HOME_PATH, PORTAL_LOGIN_PATH } from "@/lib/trainingPortalClient";
import { canvasToPngBase64, drawThumbnail, type ThumbnailCopy } from "@/lib/trainingThumbnail";

/**
 * 研修動画から研修を作る(社員用ポータル)。
 * 1. 動画をアップロード(Vimeo へ直接送る) → 2. 内容をAIに伝える(PDF・原稿・字幕)
 * → 3. AIがタイトル・説明文を作る → 4. AIの文言でサムネイルを作る
 * → 5. AIがテストを作る → 6. カリキュラムに入れる
 */

interface CourseDetail {
  course: {
    id: string;
    name: string;
    description: string | null;
    target_audience: string | null;
    source_notes: string;
    outline: { key: string; label: string; summary: string }[];
    status: string;
    video_url?: string | null;
  };
  questions: { id: string; group_key: string }[];
}

interface VideoState {
  ready: boolean;
  status: string;
  durationSec: number;
  link: string;
}

interface Curriculum {
  id: string;
  name: string;
  items: { courseId: string; name: string }[];
}

const CHUNK_BYTES = 16 * 1024 * 1024;

/** tus 方式で Vimeo に動画を送る。失敗したら Vimeo に送れた位置を確かめて続きから送り直す */
async function tusUpload(file: File, uploadLink: string, onProgress: (ratio: number) => void): Promise<void> {
  let offset = 0;
  let failures = 0;
  while (offset < file.size) {
    const chunk = file.slice(offset, Math.min(offset + CHUNK_BYTES, file.size));
    try {
      const next = await new Promise<number>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PATCH", uploadLink);
        xhr.setRequestHeader("Tus-Resumable", "1.0.0");
        xhr.setRequestHeader("Upload-Offset", String(offset));
        xhr.setRequestHeader("Content-Type", "application/offset+octet-stream");
        xhr.upload.onprogress = (e) => onProgress((offset + e.loaded) / file.size);
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            const header = xhr.getResponseHeader("Upload-Offset");
            resolve(header ? Number(header) : offset + chunk.size);
          } else {
            reject(new Error(`送信に失敗しました(${xhr.status})`));
          }
        };
        xhr.onerror = () => reject(new Error("通信が切れました"));
        xhr.send(chunk);
      });
      offset = next;
      failures = 0;
      onProgress(offset / file.size);
    } catch (e) {
      failures += 1;
      if (failures > 5) throw e;
      await new Promise((r) => setTimeout(r, 2000 * failures));
      const head = await fetch(uploadLink, { method: "HEAD", headers: { "Tus-Resumable": "1.0.0" } }).catch(() => null);
      const confirmed = head?.headers.get("Upload-Offset");
      if (confirmed) offset = Number(confirmed);
    }
  }
}

function StepTitle({ n, title, done }: { n: number; title: string; done?: boolean }) {
  return (
    <div className="section-title">
      <span className="dot" />
      <h2>
        {n}. {title}
        {done ? " ✅" : ""}
      </h2>
    </div>
  );
}

function VideoNewPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [courseId, setCourseId] = useState<string | null>(searchParams.get("courseId"));
  const [detail, setDetail] = useState<CourseDetail | null>(null);
  const [video, setVideo] = useState<VideoState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);

  // 1. アップロード
  const [file, setFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  // 2. 内容
  const [script, setScript] = useState("");
  // 3. タイトル・説明
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  // 4. サムネイル
  const [thumb, setThumb] = useState<ThumbnailCopy>({ headline: "", subline: "", keywords: ["", "", ""] });
  const [thumbSaved, setThumbSaved] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // 5. テスト
  const [pointCount, setPointCount] = useState(10);
  const [genProgress, setGenProgress] = useState<{ done: number; total: number; label: string } | null>(null);
  // 6. カリキュラム
  const [curricula, setCurricula] = useState<Curriculum[]>([]);
  const [curriculumId, setCurriculumId] = useState("");
  const [newCurriculumName, setNewCurriculumName] = useState("");

  const api = useCallback(
    async (path: string, init: { method?: string; json?: unknown; form?: FormData } = {}) => {
      const headers = await portalHeaders();
      if (!headers.Authorization) {
        router.replace(PORTAL_LOGIN_PATH);
        throw new Error("ログインが必要です。");
      }
      const res = await fetch(path, {
        method: init.method ?? "GET",
        headers: init.json !== undefined ? { ...headers, "Content-Type": "application/json" } : headers,
        body: init.form ?? (init.json !== undefined ? JSON.stringify(init.json) : undefined),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "処理に失敗しました。");
      return data;
    },
    [router]
  );

  const loadCourse = useCallback(
    async (id: string) => {
      const data = (await api(`/api/training/authoring/courses/${id}`)) as CourseDetail;
      setDetail(data);
      setTitle((prev) => prev || data.course.name);
      setDescription((prev) => prev || data.course.description || "");
      setTargetAudience((prev) => prev || data.course.target_audience || "");
      return data;
    },
    [api]
  );

  const loadVideo = useCallback(
    async (id: string) => {
      try {
        setVideo((await api(`/api/training/authoring/courses/${id}/video`)) as VideoState);
      } catch {
        // Vimeo 側の状態が取れなくても、ほかの手順は進められる
      }
    },
    [api]
  );

  const loadCurricula = useCallback(async () => {
    try {
      const data = await api("/api/training/authoring/curricula");
      setCurricula(data.curricula ?? []);
    } catch (e) {
      setMessage({ type: "error", text: (e as Error).message });
    }
  }, [api]);

  useEffect(() => {
    if (!courseId) return;
    loadCourse(courseId).catch((e) => setMessage({ type: "error", text: e.message }));
    loadVideo(courseId);
    loadCurricula();
  }, [courseId, loadCourse, loadVideo, loadCurricula]);

  // Vimeo の変換が終わるまで、30秒ごとに状態を見る
  useEffect(() => {
    if (!courseId || video?.ready) return;
    const timer = window.setInterval(() => loadVideo(courseId), 30000);
    return () => window.clearInterval(timer);
  }, [courseId, video?.ready, loadVideo]);

  useEffect(() => {
    if (canvasRef.current) drawThumbnail(canvasRef.current, thumb);
  }, [thumb]);

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setMessage(null);
    try {
      await fn();
    } catch (e) {
      setMessage({ type: "error", text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  // ---- 1. アップロード
  async function startUpload() {
    if (!file) return;
    await run("upload", async () => {
      const created = await api("/api/training/authoring/video-uploads", {
        method: "POST",
        json: { fileName: file.name, size: file.size },
      });
      setUploadProgress(0);
      await tusUpload(file, created.uploadLink, setUploadProgress);
      setCourseId(created.courseId);
      router.replace(`/training/portal/video-new?courseId=${created.courseId}`);
      setMessage({
        type: "success",
        text: "アップロードが終わりました。Vimeo で動画の変換が進んでいる間に、次の手順へ進めます。",
      });
    });
  }

  // ---- 2. 内容
  async function uploadPdf(pdf: File) {
    if (!courseId) return;
    await run("pdf", async () => {
      const form = new FormData();
      form.append("file", pdf);
      await api(`/api/training/authoring/courses/${courseId}/source`, { method: "POST", form });
      await loadCourse(courseId);
      setMessage({ type: "success", text: `「${pdf.name}」を読み込みました。` });
    });
  }

  async function saveScript() {
    if (!courseId || !detail || !script.trim()) return;
    await run("script", async () => {
      const merged = [detail.course.source_notes.trim(), `## 原稿\n\n${script.trim()}`].filter(Boolean).join("\n\n");
      await api(`/api/training/authoring/courses/${courseId}`, { method: "PATCH", json: { sourceNotes: merged } });
      setScript("");
      await loadCourse(courseId);
      setMessage({ type: "success", text: "原稿を読み込みました。" });
    });
  }

  async function importTranscript() {
    if (!courseId) return;
    await run("transcript", async () => {
      await api(`/api/training/authoring/courses/${courseId}/video/transcript`, { method: "POST" });
      await loadCourse(courseId);
      setMessage({ type: "success", text: "Vimeo の字幕を読み込みました。" });
    });
  }

  // ---- 3. タイトル・説明
  async function generatePackage() {
    if (!courseId) return;
    await run("package", async () => {
      const pkg = await api(`/api/training/authoring/courses/${courseId}/video/ai-package`, { method: "POST" });
      setTitle(pkg.title);
      setDescription(pkg.description);
      setTargetAudience(pkg.targetAudience);
      const keywords = [...(pkg.thumbnail.keywords ?? []), "", "", ""].slice(0, 3);
      setThumb({ headline: pkg.thumbnail.headline, subline: pkg.thumbnail.subline, keywords });
      setThumbSaved(false);
      await loadCourse(courseId);
      setMessage({ type: "success", text: "AIがタイトル・説明文・サムネイルの文言を作り、Vimeo にも反映しました。" });
    });
  }

  async function saveText() {
    if (!courseId) return;
    await run("text", async () => {
      await api(`/api/training/authoring/courses/${courseId}/video/ai-package`, {
        method: "PUT",
        json: { title, description, targetAudience },
      });
      await loadCourse(courseId);
      setMessage({ type: "success", text: "タイトルと説明文を保存し、Vimeo にも反映しました。" });
    });
  }

  // ---- 4. サムネイル
  async function saveThumbnail() {
    if (!courseId || !canvasRef.current) return;
    await run("thumb", async () => {
      await api(`/api/training/authoring/courses/${courseId}/video/thumbnail`, {
        method: "POST",
        json: { png: canvasToPngBase64(canvasRef.current!) },
      });
      setThumbSaved(true);
      setMessage({ type: "success", text: "サムネイルを Vimeo に設定しました。" });
    });
  }

  // ---- 5. テスト
  async function generateTest() {
    if (!courseId || !detail) return;
    if (
      detail.course.outline.length > 0 &&
      !confirm("すでに知識ポイントがあります。作り直すと、今ある問題は消えます。作り直しますか？")
    ) {
      return;
    }
    await run("test", async () => {
      setGenProgress({ done: 0, total: 0, label: "知識ポイントを考えています" });
      const proposal = await api(`/api/training/authoring/courses/${courseId}/outline`, {
        method: "POST",
        json: { pointCount },
      });
      await api(`/api/training/authoring/courses/${courseId}`, { method: "PATCH", json: { outline: proposal.points } });
      const current = await loadCourse(courseId);
      const points = current.course.outline;
      for (let i = 0; i < points.length; i++) {
        setGenProgress({ done: i, total: points.length, label: points[i].label });
        await api(`/api/training/authoring/courses/${courseId}/points/${points[i].key}/generate`, {
          method: "POST",
          json: {},
        });
      }
      setGenProgress(null);
      await loadCourse(courseId);
      setMessage({ type: "success", text: `テストができました(知識ポイント${points.length}個)。` });
    });
    setGenProgress(null);
  }

  // ---- 6. カリキュラム
  async function addToCurriculum() {
    if (!courseId) return;
    await run("curriculum", async () => {
      let target = curriculumId;
      if (target === "new") {
        if (!newCurriculumName.trim()) throw new Error("カリキュラム名を入力してください。");
        const created = await api("/api/training/authoring/curricula", {
          method: "POST",
          json: { name: newCurriculumName.trim() },
        });
        target = created.curriculumId;
      }
      if (!target) throw new Error("カリキュラムを選んでください。");
      await api(`/api/training/authoring/curricula/${target}/courses`, { method: "POST", json: { courseId } });
      await loadCurricula();
      setCurriculumId(target);
      setNewCurriculumName("");
      setMessage({ type: "success", text: "カリキュラムに入れました。" });
    });
  }

  const notes = detail?.course.source_notes ?? "";
  const questionCount = detail?.questions.length ?? 0;
  const pointsWithQuestions = detail
    ? detail.course.outline.filter((p) => detail.questions.some((q) => q.group_key === p.key)).length
    : 0;
  const testDone = !!detail && detail.course.outline.length > 0 && pointsWithQuestions === detail.course.outline.length;
  const inCurricula = curricula.filter((c) => c.items.some((i) => i.courseId === courseId));
  const disabled = busy !== null;

  return (
    <main className="page page-wide">
      <div className="page-header">
        <h1>研修動画から研修を作る</h1>
        <p>
          動画をアップロードすると、Vimeo への登録、タイトル・説明文・サムネイルの作成、テストの作成、カリキュラムへの追加までを順番に進めます。
          <a href={PORTAL_HOME_PATH} style={{ marginLeft: 8 }}>
            ポータルのトップへ戻る
          </a>
        </p>
      </div>

      {message && (
        <div className={`alert ${message.type === "error" ? "alert-error" : message.type === "success" ? "alert-success" : "alert-info"}`}>
          {message.text}
        </div>
      )}
      {genProgress && (
        <div className="alert alert-info" style={{ position: "sticky", top: 8, zIndex: 5 }}>
          {genProgress.total === 0
            ? "AIが知識ポイントを考えています…(1分ほどかかります。この画面を閉じないでください)"
            : `問題を作成中… ${genProgress.done + 1} / ${genProgress.total}「${genProgress.label}」(1つあたり30秒〜1分。この画面を閉じないでください)`}
        </div>
      )}

      {/* 1. アップロード */}
      <div className="section">
        <StepTitle n={1} title="動画をアップロードする" done={!!courseId} />
        <div className="card">
          {courseId ? (
            <>
              <p style={{ marginBottom: 4 }}>動画は Vimeo に登録済みです。</p>
              <p className="text-muted" style={{ marginBottom: 0, fontSize: 13 }}>
                {video
                  ? video.ready
                    ? `✅ 再生できる状態です(長さ ${Math.round(video.durationSec / 60)}分)。`
                    : "⏳ Vimeo で動画を変換しています(長い動画は数十分かかります)。このまま次の手順に進めます。"
                  : "Vimeo の状態を確認しています…"}
                {video?.link && (
                  <>
                    {" "}
                    <a href={video.link} target="_blank" rel="noreferrer">
                      Vimeo で開く
                    </a>
                  </>
                )}
              </p>
            </>
          ) : (
            <>
              <div className="field">
                <label>研修動画のファイル(mp4 など、5GBまで)</label>
                <input
                  type="file"
                  accept="video/*"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  disabled={disabled}
                />
              </div>
              {uploadProgress !== null && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ height: 8, background: "#e5e7eb", borderRadius: 4, overflow: "hidden" }}>
                    <div
                      style={{
                        width: `${Math.round(uploadProgress * 100)}%`,
                        height: "100%",
                        background: "var(--color-primary, #1d4ed8)",
                      }}
                    />
                  </div>
                  <p className="text-muted" style={{ fontSize: 13, marginTop: 6 }}>
                    送信中 {Math.round(uploadProgress * 100)}%(この画面を閉じないでください)
                  </p>
                </div>
              )}
              <button className="btn btn-primary" onClick={startUpload} disabled={disabled || !file}>
                {busy === "upload" ? "アップロード中..." : "アップロードを始める"}
              </button>
            </>
          )}
        </div>
      </div>

      {courseId && detail && (
        <>
          {/* 2. 内容 */}
          <div className="section">
            <StepTitle n={2} title="動画の内容をAIに伝える" done={!!notes.trim()} />
            <div className="card">
              <p className="text-muted" style={{ fontSize: 13 }}>
                AIは動画を直接見られないため、動画の内容を文字で渡します。スライドのPDF、読み上げ原稿、Vimeo の字幕のどれか1つ以上を読み込んでください。
              </p>
              <div className="field">
                <label>スライドなどのPDF(10MBまで)</label>
                <input
                  type="file"
                  accept="application/pdf"
                  disabled={disabled}
                  onChange={(e) => {
                    const pdf = e.target.files?.[0];
                    if (pdf) uploadPdf(pdf);
                    e.target.value = "";
                  }}
                />
                {busy === "pdf" && <p className="text-muted" style={{ fontSize: 13 }}>PDFを読んでいます…(1〜2分)</p>}
              </div>
              <div className="field">
                <label>読み上げ原稿・話す内容(貼り付け)</label>
                <textarea rows={5} value={script} onChange={(e) => setScript(e.target.value)} disabled={disabled} />
                <button
                  className="btn btn-outline btn-sm"
                  style={{ marginTop: 8 }}
                  onClick={saveScript}
                  disabled={disabled || !script.trim()}
                >
                  {busy === "script" ? "保存中..." : "原稿を読み込む"}
                </button>
              </div>
              <div className="field">
                <label>Vimeo の自動字幕</label>
                <button className="btn btn-outline btn-sm" onClick={importTranscript} disabled={disabled}>
                  {busy === "transcript" ? "取り込み中..." : "字幕を取り込む"}
                </button>
                <p className="text-muted" style={{ fontSize: 12, marginTop: 4, marginBottom: 0 }}>
                  動画の変換が終わったあとに使えます。Vimeo のプランによっては自動字幕が作られません。
                </p>
              </div>
              <p className="text-muted" style={{ fontSize: 13, marginBottom: 0 }}>
                {notes.trim() ? `読み込み済みの内容: 約${notes.length.toLocaleString()}文字` : "まだ何も読み込んでいません。"}
              </p>
            </div>
          </div>

          {/* 3. タイトル・説明 */}
          <div className="section">
            <StepTitle n={3} title="AIがタイトルと説明文を作る" />
            <div className="card">
              <button className="btn btn-primary" onClick={generatePackage} disabled={disabled || !notes.trim()}>
                {busy === "package" ? "AIが作成中...(30秒ほど)" : "AIで作る"}
              </button>
              <div className="field" style={{ marginTop: 16 }}>
                <label>タイトル</label>
                <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} disabled={disabled} />
              </div>
              <div className="field">
                <label>説明文(Vimeo と受講ページに表示されます)</label>
                <textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} disabled={disabled} />
              </div>
              <div className="field">
                <label>受講対象者</label>
                <input type="text" value={targetAudience} onChange={(e) => setTargetAudience(e.target.value)} disabled={disabled} />
              </div>
              <button className="btn btn-outline btn-sm" onClick={saveText} disabled={disabled || !title.trim()}>
                {busy === "text" ? "保存中..." : "手直しを保存して Vimeo に反映"}
              </button>
            </div>
          </div>

          {/* 4. サムネイル */}
          <div className="section">
            <StepTitle n={4} title="サムネイルを作る" done={thumbSaved} />
            <div className="card">
              <p className="text-muted" style={{ fontSize: 13 }}>
                手順3の「AIで作る」で、サムネイルの文言もAIが作ります。文言を直すと、その場で画像が変わります。
              </p>
              <canvas
                ref={canvasRef}
                style={{ width: "100%", maxWidth: 640, aspectRatio: "16 / 9", borderRadius: 8, display: "block", marginBottom: 12 }}
              />
              <div className="field">
                <label>見出し(16字以内がおすすめ)</label>
                <input
                  type="text"
                  value={thumb.headline}
                  onChange={(e) => {
                    setThumb({ ...thumb, headline: e.target.value });
                    setThumbSaved(false);
                  }}
                  disabled={disabled}
                />
              </div>
              <div className="field">
                <label>補足</label>
                <input
                  type="text"
                  value={thumb.subline}
                  onChange={(e) => {
                    setThumb({ ...thumb, subline: e.target.value });
                    setThumbSaved(false);
                  }}
                  disabled={disabled}
                />
              </div>
              <div className="field">
                <label>キーワード(3つまで)</label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {thumb.keywords.map((k, i) => (
                    <input
                      key={i}
                      type="text"
                      value={k}
                      style={{ flex: "1 1 120px" }}
                      onChange={(e) => {
                        const keywords = [...thumb.keywords];
                        keywords[i] = e.target.value;
                        setThumb({ ...thumb, keywords });
                        setThumbSaved(false);
                      }}
                      disabled={disabled}
                    />
                  ))}
                </div>
              </div>
              <button className="btn btn-primary btn-sm" onClick={saveThumbnail} disabled={disabled || !thumb.headline.trim()}>
                {busy === "thumb" ? "設定中..." : thumbSaved ? "設定済み(もう一度設定する)" : "このサムネイルを Vimeo に設定"}
              </button>
            </div>
          </div>

          {/* 5. テスト */}
          <div className="section">
            <StepTitle n={5} title="AIがテストを作る" done={testDone} />
            <div className="card">
              <p className="text-muted" style={{ fontSize: 13 }}>
                読み込んだ内容から、AIが知識ポイントを決めて、ポイントごとに問題を作ります。受講者は動画を最後まで見てからテストを受けます。
              </p>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <label style={{ fontSize: 14 }}>
                  知識ポイントの数:
                  <select
                    value={pointCount}
                    onChange={(e) => setPointCount(Number(e.target.value))}
                    disabled={disabled}
                    style={{ marginLeft: 8, width: "auto" }}
                  >
                    {[5, 8, 10, 12, 15, 20].map((n) => (
                      <option key={n} value={n}>
                        {n}個前後
                      </option>
                    ))}
                  </select>
                </label>
                <button className="btn btn-primary" onClick={generateTest} disabled={disabled || !notes.trim()}>
                  {busy === "test" ? "作成中..." : detail.course.outline.length > 0 ? "テストを作り直す" : "AIでテストを作る"}
                </button>
              </div>
              {detail.course.outline.length > 0 && (
                <p style={{ marginTop: 12, marginBottom: 0 }}>
                  知識ポイント {detail.course.outline.length}個・問題 {questionCount}問
                  {!testDone && "(問題がまだのポイントがあります)"}
                  <a href={`/training/portal/course/${courseId}?step=questions`} style={{ marginLeft: 8 }}>
                    問題を確認・修正する
                  </a>
                </p>
              )}
            </div>
          </div>

          {/* 6. カリキュラム */}
          <div className="section">
            <StepTitle n={6} title="カリキュラムに入れる" done={inCurricula.length > 0} />
            <div className="card">
              {inCurricula.length > 0 && (
                <p style={{ marginTop: 0 }}>
                  入っているカリキュラム: {inCurricula.map((c) => `「${c.name}」`).join("、")}
                </p>
              )}
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <select value={curriculumId} onChange={(e) => setCurriculumId(e.target.value)} disabled={disabled} style={{ width: "auto" }}>
                  <option value="">カリキュラムを選ぶ</option>
                  {curricula.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}({c.items.length}本)
                    </option>
                  ))}
                  <option value="new">+ 新しいカリキュラムを作る</option>
                </select>
                {curriculumId === "new" && (
                  <input
                    type="text"
                    placeholder="例: 不動産営業 新人研修"
                    value={newCurriculumName}
                    onChange={(e) => setNewCurriculumName(e.target.value)}
                    disabled={disabled}
                    style={{ flex: "1 1 220px" }}
                  />
                )}
                <button className="btn btn-primary btn-sm" onClick={addToCurriculum} disabled={disabled || !curriculumId}>
                  {busy === "curriculum" ? "追加中..." : "カリキュラムに入れる"}
                </button>
              </div>
              <p className="text-muted" style={{ fontSize: 13, marginTop: 12, marginBottom: 0 }}>
                並び順の変更は <a href="/training/portal/curricula">カリキュラムの管理</a> でできます。
              </p>
            </div>
          </div>

          {/* 仕上げ */}
          <div className="section">
            <div className="card">
              <p style={{ fontWeight: 600, marginTop: 0 }}>仕上げ</p>
              <p className="text-muted" style={{ fontSize: 13 }}>
                問題を確認したら、テストの「確認・配布」から配布を始めてください。配布中のテストだけが、カリキュラムの受講者に表示されます。
              </p>
              <a className="btn btn-primary" href={`/training/portal/course/${courseId}?step=publish`}>
                確認・配布の画面へ
              </a>
            </div>
          </div>
        </>
      )}
    </main>
  );
}

export default function VideoNewPage() {
  return (
    <Suspense fallback={<main className="page page-narrow"><p className="text-muted">読み込み中...</p></main>}>
      <VideoNewPageInner />
    </Suspense>
  );
}
