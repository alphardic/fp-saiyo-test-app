"use client";

import { useCallback } from "react";
import { useParams } from "next/navigation";
import TrainingCourseEditor from "@/components/TrainingCourseEditor";

export default function TrainingAuthorCoursePage() {
  const params = useParams<{ token: string; courseId: string }>();
  const getHeaders = useCallback(async () => ({ "x-author-token": params.token }), [params.token]);

  return (
    <TrainingCourseEditor
      courseId={params.courseId}
      getHeaders={getHeaders}
      backHref={`/training/author/${params.token}`}
      backLabel="作成したテストの一覧へ"
    />
  );
}
