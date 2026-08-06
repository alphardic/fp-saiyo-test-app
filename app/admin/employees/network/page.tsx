"use client";

import { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { formatMbti } from "@/lib/mbti";
import { getKyuseiKigaku, getRokuseiSenjutsu } from "@/lib/fortune";
import { computeCompatibility, CompatibilityProfile } from "@/lib/compatibility";

interface EmployeeRow {
  id: string;
  name: string;
  department: string | null;
  birthdate: string | null;
  mbti: string | null;
}

type Mode = "overall" | "mbti" | "kyusei" | "rokusei";

const MODE_LABELS: Record<Mode, string> = {
  overall: "総合",
  mbti: "MBTI",
  kyusei: "九星気学",
  rokusei: "六星占術",
};

// スコアがこの値以上のペアだけ線を表示する(全部表示すると見づらいため)
const SCORE_THRESHOLD = 60;

function scoreColor(score: number): string {
  if (score >= 80) return "#2f9e44"; // 濃い緑: とても良い
  if (score >= 70) return "#74b816"; // 黄緑: 良い
  return "#adb5bd"; // グレー: 普通
}

function scoreLabel(score: number): string {
  if (score >= 80) return "とても良い";
  if (score >= 70) return "良い";
  return "普通";
}

const LEGEND_ITEMS = [
  { color: "#2f9e44", label: "とても良い(80点以上)" },
  { color: "#74b816", label: "良い(70〜79点)" },
  { color: "#adb5bd", label: "普通(60〜69点)" },
];

export default function EmployeeNetworkPage() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const networkRef = useRef<any>(null);
  const edgesDataRef = useRef<any>(null);
  const pairScoresRef = useRef<
    Map<string, { overall: number; mbti: number; kyusei: number; rokusei: number; a: string; b: string }>
  >(new Map());

  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("overall");
  const [ready, setReady] = useState(false);
  const [nameById, setNameById] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const { data: sessionData } = await supabaseBrowser.auth.getSession();
        const accessToken = sessionData.session?.access_token;
        if (!accessToken) throw new Error("ログインが必要です。");
        const res = await fetch("/api/admin/employees", {
          headers: { Authorization: "Bearer " + accessToken },
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "データの取得に失敗しました。");
        if (!cancelled) {
          setEmployees(json.employees ?? []);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "エラーが発生しました。");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // ネットワーク図の構築(社員データが揃ったら一度だけ)
  useEffect(() => {
    if (loading || error || employees.length === 0 || !containerRef.current) return;

    const profiles: { id: string; name: string; profile: CompatibilityProfile }[] = [];
    const skippedNames: string[] = [];

    for (const e of employees) {
      if (!e.mbti || !e.birthdate) {
        skippedNames.push(e.name);
        continue;
      }
      const birthdate = new Date(e.birthdate);
      const kyuseiStar = getKyuseiKigaku(birthdate);
      const rokusei = getRokuseiSenjutsu(birthdate);
      if (!kyuseiStar || !rokusei) {
        skippedNames.push(e.name);
        continue;
      }
      profiles.push({ id: e.id, name: e.name, profile: { mbti: e.mbti, kyuseiStar, rokusei } });
    }
    setSkipped(skippedNames);
    setNameById(Object.fromEntries(profiles.map((p) => [p.id, p.name])));

    if (profiles.length < 2) return;

    const pairScores = new Map<
      string,
      { overall: number; mbti: number; kyusei: number; rokusei: number; a: string; b: string }
    >();
    for (let i = 0; i < profiles.length; i++) {
      for (let j = i + 1; j < profiles.length; j++) {
        const a = profiles[i];
        const b = profiles[j];
        const scores = computeCompatibility(a.profile, b.profile);
        pairScores.set(`${a.id}__${b.id}`, { ...scores, a: a.id, b: b.id });
      }
    }
    pairScoresRef.current = pairScores;

    let cancelled = false;

    import("vis-network/standalone").then(({ Network, DataSet }) => {
      if (cancelled || !containerRef.current) return;

      const nodes = new DataSet(
        profiles.map((p) => ({
          id: p.id,
          label: p.name,
          shape: "dot",
          size: 18,
          font: { size: 14 },
          color: { background: "#c9a24b", border: "#8a6d2f" },
        }))
      );

      const edges = new DataSet(buildEdges(pairScores, mode));
      edgesDataRef.current = edges;

      const network = new Network(
        containerRef.current,
        { nodes, edges },
        {
          nodes: { borderWidth: 2 },
          edges: {
            smooth: { enabled: true, type: "continuous", roundness: 0.2 },
            font: { size: 13, strokeWidth: 4, strokeColor: "#ffffff", align: "middle" },
          },
          physics: {
            solver: "forceAtlas2Based",
            forceAtlas2Based: { gravitationalConstant: -60, springLength: 140 },
            stabilization: { iterations: 150 },
          },
          interaction: { hover: true },
        }
      );
      networkRef.current = network;
      setReady(true);
    });

    return () => {
      cancelled = true;
      if (networkRef.current) {
        networkRef.current.destroy();
        networkRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, error, employees]);

  // モード切り替え時: 既存のedgesデータセットだけ更新(グラフの再構築はしない)
  useEffect(() => {
    if (!ready || !edgesDataRef.current) return;
    const newEdges = buildEdges(pairScoresRef.current, mode);
    edgesDataRef.current.clear();
    edgesDataRef.current.add(newEdges);
  }, [mode, ready]);

  function buildEdges(
    pairScores: Map<string, { overall: number; mbti: number; kyusei: number; rokusei: number; a: string; b: string }>,
    m: Mode
  ) {
    const result: any[] = [];
    pairScores.forEach((s) => {
      const score = s[m];
      if (score < SCORE_THRESHOLD) return;
      result.push({
        from: s.a,
        to: s.b,
        label: String(score),
        width: Math.max(1, (score - 50) / 8),
        color: { color: scoreColor(score), opacity: 0.85 },
        title: `${MODE_LABELS[m]}相性: ${score}点(${scoreLabel(score)})`,
      });
    });
    return result;
  }

  return (
    <main className="page page-wide">
      <div className="page-header">
        <a href="/admin/employees" className="text-muted" style={{ fontSize: 13 }}>
          ← 社員一覧へ戻る
        </a>
        <h1 style={{ marginTop: 8 }}>相性の相関図</h1>
        <p>
          MBTI・九星気学・六星占術の一般的な傾向に基づく、社員間の相性の参考値です。
          点数が高いほど相性が良い傾向があるという参考値で、断定的な診断ではありません。
          スコア{SCORE_THRESHOLD}点未満のペアは図に線を出していません。
        </p>
      </div>

      {loading && <p className="text-muted">読み込み中...</p>}
      {error && <div className="alert alert-error">{error}</div>}

      {!loading && !error && (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              {(Object.keys(MODE_LABELS) as Mode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={mode === m ? "btn btn-primary btn-sm" : "btn btn-outline btn-sm"}
                >
                  {MODE_LABELS[m]}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12 }}>
              {LEGEND_ITEMS.map((item) => (
                <span key={item.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span
                    style={{
                      display: "inline-block",
                      width: 20,
                      height: 4,
                      borderRadius: 2,
                      background: item.color,
                    }}
                  />
                  {item.label}
                </span>
              ))}
              <span className="text-muted">線の上の数字がスコア(0〜100点)です</span>
            </div>
          </div>

          {skipped.length > 0 && (
            <div className="alert" style={{ marginBottom: 16, fontSize: 13 }}>
              MBTI・生年月日が未登録、または占いが計算できない社員は図に表示されていません:{" "}
              {skipped.join("、")}
            </div>
          )}

          <div className="card" style={{ padding: 0, marginBottom: 16 }}>
            <div ref={containerRef} style={{ width: "100%", height: 560 }} />
          </div>

          <div className="section" style={{ marginBottom: 0 }}>
            <div className="section-title">
              <span className="dot" />
              <h2>相性スコア一覧(全ペア・{MODE_LABELS[mode]})</h2>
            </div>
            <div className="card" style={{ padding: 0 }}>
              <div className="table-wrap" style={{ border: "none" }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ padding: "8px 12px" }}>組み合わせ</th>
                      <th style={{ padding: "8px 12px" }}>スコア</th>
                      <th style={{ padding: "8px 12px" }}>評価</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from(pairScoresRef.current.values())
                      .sort((x, y) => y[mode] - x[mode])
                      .map((s, i) => (
                        <tr key={i}>
                          <td style={{ padding: "8px 12px" }}>
                            {nameById[s.a] ?? "?"} ⇔ {nameById[s.b] ?? "?"}
                          </td>
                          <td style={{ padding: "8px 12px", fontWeight: 600 }}>{s[mode]}点</td>
                          <td style={{ padding: "8px 12px" }}>
                            <span
                              style={{
                                display: "inline-block",
                                width: 10,
                                height: 10,
                                borderRadius: "50%",
                                background: scoreColor(s[mode]),
                                marginRight: 6,
                                verticalAlign: "middle",
                              }}
                            />
                            {scoreLabel(s[mode])}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </main>
  );
}