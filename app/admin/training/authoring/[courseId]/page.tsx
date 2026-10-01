"use client";

import { useCallback } from "react";
import { useParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import TrainingCourseEditor from "@/components/TrainingCourseEditor";

export default function TrainingAuthoringReviewPage() {
  const params = useParams<{ courseId: string }>();
  const getHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const { data } = await supabaseBrowser.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: "Bearer " + token } : {};
  }, []);

  return (
    <TrainingCourseEditor
      courseId={params.courseId}
      getHeaders={getHeaders}
      backHref="/admin/training/authoring"
      backLabel="承認一覧へ戻る"
    />
  );
}
