"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 社内テストの研修動画(Vimeo)を再生し、どこまで見たかをサーバーに記録する。
 *
 * - 再生した秒だけを記録する。シークバーで先へ飛ばした区間は数えない
 * - 1.5倍・2倍での再生はそのまま数える(Vimeoの速度ボタンを使える)
 * - 記録は約10秒ごと・一時停止・再生終了・ページを離れるときに送る
 */

export interface VideoStatus {
  url: string;
  durationSec: number;
  watchedSec: number;
  percent: number;
  completed: boolean;
}

interface VimeoPlayer {
  on(event: string, cb: (data: { seconds: number; duration: number }) => void): void;
  getDuration(): Promise<number>;
  destroy(): Promise<void>;
}

declare global {
  interface Window {
    Vimeo?: { Player: new (el: HTMLIFrameElement) => VimeoPlayer };
  }
}

const PLAYER_SCRIPT = "https://player.vimeo.com/api/player.js";

function loadPlayerScript(): Promise<void> {
  if (window.Vimeo) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${PLAYER_SCRIPT}"]`);
    const script = existing ?? document.createElement("script");
    script.addEventListener("load", () => resolve());
    script.addEventListener("error", () => reject(new Error("プレーヤーを読み込めませんでした。")));
    if (!existing) {
      script.src = PLAYER_SCRIPT;
      script.async = true;
      document.head.appendChild(script);
    }
  });
}

function formatMinutes(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}分${String(s).padStart(2, "0")}秒`;
}

/** 早送り・巻き戻しとみなさない、1回の時刻の進みの上限(秒)。2倍速でも0.5秒程度 */
const MAX_NATURAL_STEP = 3;

export default function TrainingVideoPlayer({
  token,
  initial,
  onChange,
}: {
  token: string;
  initial: VideoStatus;
  onChange: (status: VideoStatus) => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const pending = useRef<Set<number>>(new Set());
  const duration = useRef<number>(initial.durationSec);
  const [status, setStatus] = useState<VideoStatus>(initial);
  const [error, setError] = useState<string | null>(null);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    let player: VimeoPlayer | null = null;
    let last: number | null = null;
    let cancelled = false;

    async function flush(keepalive = false) {
      if (pending.current.size === 0) return;
      const seconds = Array.from(pending.current);
      pending.current = new Set();
      try {
        const res = await fetch(`/api/training/${token}/video-progress`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ seconds, duration: duration.current }),
          keepalive,
        });
        const data = (await res.json().catch(() => ({}))) as { video?: VideoStatus; error?: string };
        if (!res.ok || !data.video) {
          seconds.forEach((s) => pending.current.add(s));
          if (!cancelled) setError(data.error ?? "視聴記録を保存できませんでした。通信状況を確認してください。");
          return;
        }
        if (!cancelled) {
          setError(null);
          setStatus(data.video);
          onChangeRef.current(data.video);
        }
      } catch {
        seconds.forEach((s) => pending.current.add(s));
      }
    }

    function record(from: number, to: number) {
      for (let s = Math.floor(from); s <= Math.floor(to); s++) pending.current.add(s);
    }

    loadPlayerScript()
      .then(() => {
        if (cancelled || !iframeRef.current || !window.Vimeo) return;
        player = new window.Vimeo.Player(iframeRef.current);
        player.getDuration().then((d) => {
          if (d > 0) duration.current = Math.floor(d);
        });
        player.on("timeupdate", ({ seconds, duration: d }) => {
          if (d > 0) duration.current = Math.floor(d);
          if (last !== null) {
            const step = seconds - last;
            if (step > 0 && step <= MAX_NATURAL_STEP) record(last, seconds);
          }
          last = seconds;
        });
        player.on("seeked", ({ seconds }) => {
          last = seconds;
        });
        player.on("pause", () => flush());
        player.on("ended", () => flush());
      })
      .catch((e: Error) => setError(e.message));

    const timer = window.setInterval(() => flush(), 10000);
    const onHide = () => {
      if (document.visibilityState === "hidden") flush(true);
    };
    document.addEventListener("visibilitychange", onHide);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onHide);
      flush(true);
      player?.destroy().catch(() => undefined);
    };
  }, [token]);

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <p style={{ fontWeight: 600, marginBottom: 12 }}>研修動画</p>
      <div style={{ position: "relative", paddingTop: "56.25%", background: "#000", borderRadius: 8, overflow: "hidden" }}>
        <iframe
          ref={iframeRef}
          src={status.url}
          title="研修動画"
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
        />
      </div>

      <div style={{ marginTop: 12 }}>
        <div style={{ height: 8, background: "#e5e7eb", borderRadius: 4, overflow: "hidden" }}>
          <div
            style={{
              width: `${status.completed ? 100 : status.percent}%`,
              height: "100%",
              background: status.completed ? "var(--color-success, #1a7f37)" : "var(--color-primary, #1d4ed8)",
              transition: "width 0.3s",
            }}
          />
        </div>
        <p className="text-muted" style={{ marginTop: 8, marginBottom: 0, fontSize: 13 }}>
          {status.completed
            ? "✅ 視聴が完了しました。テストを開始できます。"
            : status.durationSec > 0
              ? `視聴済み ${formatMinutes(status.watchedSec)} / ${formatMinutes(status.durationSec)}(${status.percent}%)。最後まで見るとテストを開始できます。`
              : "動画を最後まで見ると、テストを開始できます。"}
        </p>
        {!status.completed && (
          <p className="text-muted" style={{ marginTop: 4, marginBottom: 0, fontSize: 12 }}>
            右下の歯車ボタンから再生速度(1.5倍・2倍など)を変えられます。先へ飛ばした部分は視聴済みに数えません。
          </p>
        )}
        {error && <p style={{ marginTop: 8, marginBottom: 0, fontSize: 13, color: "var(--color-error)" }}>{error}</p>}
      </div>
    </div>
  );
}
