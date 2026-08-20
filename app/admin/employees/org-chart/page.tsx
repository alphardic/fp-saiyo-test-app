"use client";

import { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

interface EmployeeRow {
  id: string;
  name: string;
  department: string | null;
  position: string | null;
  manager_id: string | null;
}

export default function OrgChartPage() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const networkRef = useRef<any>(null);

  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cycleNames, setCycleNames] = useState<string[]>([]);

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
        if (!cancelled) setEmployees(json.employees ?? []);
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

  useEffect(() => {
    if (loading || error || employees.length === 0 || !containerRef.current) return;

    const byId = new Map(employees.map((e) => [e.id, e]));

    // 上司の連鎖が循環している社員を検出し、その社員だけ上司なし扱いにして描画する
    const cyclic = new Set<string>();
    for (const e of employees) {
      const visited = new Set<string>();
      let currentId: string | null = e.manager_id;
      while (currentId) {
        if (currentId === e.id) {
          cyclic.add(e.id);
          break;
        }
        if (visited.has(currentId)) break;
        visited.add(currentId);
        currentId = byId.get(currentId)?.manager_id ?? null;
      }
    }
    setCycleNames(Array.from(cyclic).map((id) => byId.get(id)?.name ?? "?"));

    let cancelled = false;

    import("vis-network/standalone").then(({ Network, DataSet }) => {
      if (cancelled || !containerRef.current) return;

      const nodes = new DataSet(
        employees.map((e) => ({
          id: e.id,
          label: e.position ? `${e.name}\n(${e.position})` : e.name,
          shape: "box",
          color: { background: "#c9a24b", border: "#8a6d2f" },
          font: { size: 14, color: "#1a1a1a" },
        }))
      );

      const edgeList: any[] = [];
      for (const e of employees) {
        if (e.manager_id && byId.has(e.manager_id) && !cyclic.has(e.id)) {
          edgeList.push({ from: e.manager_id, to: e.id });
        }
      }
      const edges = new DataSet(edgeList);

      const network = new Network(
        containerRef.current,
        { nodes, edges },
        {
          layout: {
            hierarchical: {
              direction: "UD",
              sortMethod: "directed",
              levelSeparation: 120,
              nodeSpacing: 160,
            },
          },
          nodes: { borderWidth: 2 },
          edges: {
            arrows: "to",
            color: { color: "#adb5bd" },
            smooth: { enabled: true, type: "cubicBezier", forceDirection: "vertical", roundness: 0.4 },
          },
          physics: false,
          interaction: { hover: true },
        }
      );
      networkRef.current = network;
    });

    return () => {
      cancelled = true;
      if (networkRef.current) {
        networkRef.current.destroy();
        networkRef.current = null;
      }
    };
  }, [loading, error, employees]);

  return (
    <main className="page page-wide">
      <div className="page-header">
        <a href="/admin/employees" className="text-muted" style={{ fontSize: 13 }}>
          ← 社員一覧へ戻る
        </a>
        <h1 style={{ marginTop: 8 }}>組織図</h1>
        <p>社員一覧で登録した「役職」「上司」をもとに、報告ラインをツリー表示します。上司未設定の社員は最上位に表示されます。</p>
      </div>

      {loading && <p className="text-muted">読み込み中...</p>}
      {error && <div className="alert alert-error">{error}</div>}

      {!loading && !error && (
        <>
          {cycleNames.length > 0 && (
            <div className="alert alert-error" style={{ marginBottom: 16, fontSize: 13 }}>
              上司の設定が循環しているため、以下の社員は上司なしとして表示しています。社員一覧で上司の設定を見直してください:{" "}
              {cycleNames.join("、")}
            </div>
          )}
          <div className="card" style={{ padding: 0 }}>
            <div ref={containerRef} style={{ width: "100%", height: 620 }} />
          </div>
        </>
      )}
    </main>
  );
}
