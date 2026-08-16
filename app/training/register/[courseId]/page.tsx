"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

interface Course {
  id: string;
  name: string;
  description: string | null;
}

export default function TrainingRegisterPage() {
  const params = useParams<{ courseId: string }>();
  const router = useRouter();
  const courseId = params.courseId;

  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!courseId) return;
    (async () => {
      const res = await fetch(`/api/training/course/${courseId}`);
      const data = (await res.json()) as Course & { error?: string };
      if (!res.ok) {
        setLoadError(data.error ?? "コースが見つかりません。");
        setLoading(false);
        return;
      }
      setCourse(data);
      setLoading(false);
    })();
  }, [courseId]);

  async function handleSubmit() {
    setError(null);
    if (!name.trim() || !email.trim()) {
      setError("氏名とメールアドレスを入力してください。");
      return;
    }
    setSubmitting(true);
    const res = await fetch("/api/training/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courseId, name: name.trim(), email: email.trim() }),
    });
    const data = (await res.json()) as { inviteToken?: string; error?: string };
    setSubmitting(false);
    if (!res.ok) {
      setError(data.error ?? "登録に失敗しました。");
      return;
    }
    if (data.inviteToken) {
      router.push(`/training/${data.inviteToken}`);
    }
  }

  if (loading) {
    return (
      <main className="page page-narrow">
        <p className="text-muted">読み込み中...</p>
      </main>
    );
  }

  if (loadError || !course) {
    return (
      <main className="page page-narrow">
        <div className="alert alert-error">{loadError ?? "コースが見つかりません。"}</div>
      </main>
    );
  }

  return (
    <main className="page page-narrow">
      <div className="page-header">
        <h1>{course.name}</h1>
        <p>受験には氏名とメールアドレスの登録が必要です。</p>
      </div>

      {course.description && (
        <div className="card" style={{ marginBottom: 16 }}>
          <p className="text-muted" style={{ marginBottom: 0 }}>{course.description}</p>
        </div>
      )}

      <div className="card">
        <div className="field" style={{ marginBottom: 16 }}>
          <label htmlFor="reg-name">氏名</label>
          <input
            id="reg-name"
            type="text"
            placeholder="山田 太郎"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="field" style={{ marginBottom: 16 }}>
          <label htmlFor="reg-email">メールアドレス(@alpha-fp.com または @peoples-connect.com)</label>
          <input
            id="reg-email"
            type="email"
            placeholder="taro@alpha-fp.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}
        <button onClick={handleSubmit} disabled={submitting} className="btn btn-primary btn-block">
          {submitting ? "登録中..." : "登録してテストへ進む"}
        </button>
      </div>
    </main>
  );
}
