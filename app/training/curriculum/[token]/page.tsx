"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

/**
 * 受講者向けのカリキュラムページ。上から順に受講し、前のテストに合格すると次に進める。
 */

interface Item {
  courseId: string;
  name: string;
  available: boolean;
  hasVideo: boolean;
  videoCompleted: boolean;
  videoPercent: number;
  passed: boolean;
  attemptCount: number;
  locked: boolean;
  inviteToken: string | null;
}

interface CurriculumResponse {
  employeeName: string;
  name: string;
  description: string | null;
  items: Item[];
}

function statusOf(item: Item): { text: string; color?: string } {
  if (!item.available) return { text: "準備中" };
  if (item.passed) return { text: "🟢 合格", color: "var(--color-success, #1a7f37)" };
  if (item.locked) return { text: "🔒 前の研修に合格すると受けられます" };
  if (item.attemptCount > 0) return { text: "🔴 不合格(再受験できます)", color: "var(--color-error)" };
  if (item.hasVideo && !item.videoCompleted) {
    return { text: item.videoPercent > 0 ? `🟡 動画 ${item.videoPercent}% 視聴` : "⚪ 未受講" };
  }
  if (item.hasVideo && item.videoCompleted) return { text: "🟡 動画視聴済み・テスト未受験" };
  return { text: "⚪ 未受講" };
}

export default function CurriculumPage() {
  const params = useParams<{ token: string }>();
  const [data, setData] = useState<CurriculumResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!params.token) return;
    fetch(`/api/training/curriculum/${params.token}`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error ?? "読み込みに失敗しました。");
        setData(body);
      })
      .catch((e: Error) => setError(e.message));
  }, [params.token]);

  if (error) {
    return (
      <main className="page page-narrow">
        <div className="alert alert-error">{error}</div>
      </main>
    );
  }
  if (!data) {
    return (
      <main className="page page-narrow">
        <p className="text-muted">読み込み中...</p>
      </main>
    );
  }

  const available = data.items.filter((i) => i.available);
  const passedCount = available.filter((i) => i.passed).length;
  const allPassed = available.length > 0 && passedCount === available.length;

  return (
    <main className="page page-narrow">
      <div className="page-header">
        <h1>{data.name}</h1>
        <p>{data.employeeName} 様</p>
      </div>

      {data.description && (
        <div className="card" style={{ marginBottom: 16 }}>
          <p className="text-muted" style={{ margin: 0 }}>{data.description}</p>
        </div>
      )}

      <div className={`alert ${allPassed ? "alert-success" : "alert-info"}`}>
        {allPassed
          ? `すべての研修に合格しました(${passedCount} / ${available.length})。おつかれさまでした。`
          : `進み具合: ${passedCount} / ${available.length} 合格。上から順に受講してください。`}
      </div>

      {data.items.map((item, i) => {
        const status = statusOf(item);
        const canOpen = item.available && !item.locked && !!item.inviteToken;
        return (
          <div
            key={item.courseId}
            className="card"
            style={{ marginBottom: 12, opacity: item.available && !item.locked ? 1 : 0.6 }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div>
                <p className="text-muted" style={{ fontSize: 12, margin: 0 }}>
                  STEP {i + 1}
                  {item.hasVideo ? "・動画 + テスト" : "・テスト"}
                </p>
                <p style={{ fontWeight: 600, margin: "2px 0 4px" }}>{item.name}</p>
                <p style={{ fontSize: 13, margin: 0, color: status.color }}>{status.text}</p>
              </div>
              {canOpen && (
                <a className={`btn ${item.passed ? "btn-outline" : "btn-primary"} btn-sm`} href={`/training/${item.inviteToken}`}>
                  {item.passed ? "見直す" : item.hasVideo && !item.videoCompleted ? "動画を見る" : "受講する"}
                </a>
              )}
            </div>
          </div>
        );
      })}
    </main>
  );
}
