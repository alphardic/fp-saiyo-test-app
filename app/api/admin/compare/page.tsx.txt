"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";

const FIELDS = [
  "為替市場",
  "金利市場",
  "株式投資",
  "投資信託",
  "債券",
  "居住用不動産",
  "投資用不動産",
  "保険",
];

const COLORS = ["#0f2942", "#b8923f", "#1c7a4a", "#b3261e", "#6b3fa0", "#1c6ea4"];

interface CandidateResult {
  sessionId: string;
  name: string;
  email: string;
  fieldScores: Record<string, number>;
  overallScore: number;
}

interface CompareData {
  candidates: CandidateResult[];
  comparisonSummary: string | null;
}

function scoreColor(score: number) {
  if (score >= 70) return "var(--color-success)";
  if (score >= 40) return "var(--color-warning)";
  return "var(--color-error)";
}

/** N軸(分野数)のレーダーチャートをSVGで描画する(外部ライブラリ不使用)。 */
function RadarChart({ candidates }: { candidates: CandidateResult[] }) {
  const size = 420;
  const center = size / 2;
  const maxRadius = size / 2 - 70;
  const axisCount = FIELDS.length;

  function pointFor(index: number, value: number) {
    const angle = (Math.PI * 2 * index) / axisCount - Math.PI / 2;
    const r = (value / 100) * maxRadius;
    return {
      x: center + r * Math.cos(angle),
      y: center + r * Math.sin(angle),
    };
  }

  function labelPointFor(index: number) {
    const angle = (Math.PI * 2 * index) / axisCount - Math.PI / 2;
    const r = maxRadius + 34;
    return {
      x: center + r * Math.cos(angle),
      y: center + r * Math.sin(angle),
    };
  }

  const gridLevels = [25, 50, 75, 100];

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {gridLevels.map((level) => {
        const pts = FIELDS.map((_, i) => pointFor(i, level));
        const path = pts.map((p) => `${p.x},${p.y}`).join(" ");
        return (
          <polygon
            key={level}
            points={path}
            fill="none"
            stroke="var(--color-border)"
            strokeWidth={1}
          />
        );
      })}

      {FIELDS.map((_, i) => {
        const p = pointFor(i, 100);
        return (
          <line
            key={i}
            x1={center}
            y1={center}
            x2={p.x}
            y2={p.y}
            stroke="var(--color-border)"
            strokeWidth={1}
          />
        );
      })}

      {FIELDS.map((field, i) => {
        const p = labelPointFor(i);
        return (
          <text
            key={field}
            x={p.x}
            y={p.y}
            fontSize={12}
            fill="var(--color-text-muted)"
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {field}
          </text>
        );
      })}

      {candidates.map((c, ci) => {
        const pts = FIELDS.map((field, i) => pointFor(i, c.fieldScores[field] ?? 0));
        const path = pts.map((p) => `${p.x},${p.y}`).join(" ");
        const color = COLORS[ci % COLORS.length];
        return (
          <g key={c.sessionId}>
            <polygon points={path} fill={color} fillOpacity={0.12} stroke={color} strokeWidth={2} />
            {pts.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={3} fill={color} />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

export default function ComparePage() {
  const searchParams = useSearchParams();
  const ids = (searchParams.get("ids") ?? "").split(",").filter(Boolean);

  const [data, setData] = useState<CompareData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    setLoading(true);
    setError(null);

    const { data: sessionData } = await supabaseBrowser.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setError("ログインが必要です。");
      setLoading(false);
      return;
    }

    const res = await fetch(`/api/admin/compare?ids=${encodeURIComponent(ids.join(","))}`, {
      headers: { Authorization: "Bearer " + token },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "比較データの取得に失敗しました。");
      setLoading(false);
      return;
    }

    const body = (await res.json()) as CompareData;
    setData(body);
    setLoading(false);
  }

  if (loading) {
    return (
      <main className="page">
        <p className="text-muted">読み込み中...</p>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="page page-narrow">
        <div className="card">
          <div className="alert alert-error" style={{ marginBottom: 12 }}>
            {error ?? "データが見つかりません。"}
          </div>
          <a href="/admin" className="btn btn-outline">
            ダッシュボードへ戻る
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
        <h1 style={{ marginTop: 8 }}>候補者比較</h1>
        <p>{data.candidates.map((c) => c.name).join(" / ")}</p>
      </div>

      <div className="section">
        <div className="section-title">
          <span className="dot" />
          <h2>傾向分析</h2>
        </div>
        <div className="card">
          {data.comparisonSummary ? (
            <p style={{ marginBottom: 0, whiteSpace: "pre-wrap" }}>{data.comparisonSummary}</p>
          ) : (
            <p className="text-muted" style={{ marginBottom: 0 }}>
              分析コメントの生成に失敗しました。表・グラフは通常どおりご覧いただけます。
            </p>
          )}
        </div>
      </div>

      <div className="section">
        <div className="section-title">
          <span className="dot" />
          <h2>分野別スコア(レーダーチャート)</h2>
        </div>
        <div className="card" style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <RadarChart candidates={data.candidates} />
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginTop: 12 }}>
            {data.candidates.map((c, i) => (
              <div key={c.sessionId} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                <span
                  style={{
                    display: "inline-block",
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: COLORS[i % COLORS.length],
                  }}
                />
                {c.name}(総合{c.overallScore}点)
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="section" style={{ marginBottom: 0 }}>
        <div className="section-title">
          <span className="dot" />
          <h2>分野別スコア(表)</h2>
        </div>
        <div className="card">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>分野</th>
                  {data.candidates.map((c) => (
                    <th key={c.sessionId}>{c.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FIELDS.map((field) => (
                  <tr key={field}>
                    <td className="text-muted">{field}</td>
                    {data.candidates.map((c) => {
                      const score = c.fieldScores[field] ?? 0;
                      return (
                        <td key={c.sessionId} style={{ fontWeight: 600, color: scoreColor(score) }}>
                          {score}点
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr>
                  <td style={{ fontWeight: 700 }}>総合(単純平均)</td>
                  {data.candidates.map((c) => (
                    <td key={c.sessionId} style={{ fontWeight: 700 }}>
                      {c.overallScore}点
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}
