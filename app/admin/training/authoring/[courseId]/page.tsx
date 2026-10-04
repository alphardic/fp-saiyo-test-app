"use client";

import { useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import TrainingCourseEditor, { parseStep } from "@/components/TrainingCourseEditor";

export default function TrainingAuthoringReviewPage() {
  const params = useParams<{ courseId: string }>();
  const searchParams = useSearchParams();
  const getHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const { data } = await supabaseBrowser.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: "Bearer " + token } : {};
  }, []);

  return (
    <TrainingCourseEditor
      courseId={params.courseId}
      step={parseStep(searchParams.get("step"))}
      basePath={`/admin/training/authoring/${params.courseId}`}
      getHeaders={getHeaders}
      backHref="/admin/training/authoring"
      backLabel="社員が作ったテストの一覧へ"
      loginHref="/admin/login"
    />
  );
}
