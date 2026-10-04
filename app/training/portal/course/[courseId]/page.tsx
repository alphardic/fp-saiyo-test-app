"use client";

import { useParams, useSearchParams } from "next/navigation";
import TrainingCourseEditor, { parseStep } from "@/components/TrainingCourseEditor";
import { portalHeaders, PORTAL_HOME_PATH } from "@/lib/trainingPortalClient";

export default function TrainingPortalCoursePage() {
  const params = useParams<{ courseId: string }>();
  const searchParams = useSearchParams();

  return (
    <TrainingCourseEditor
      courseId={params.courseId}
      step={parseStep(searchParams.get("step"))}
      basePath={`/training/portal/course/${params.courseId}`}
      getHeaders={portalHeaders}
      backHref={PORTAL_HOME_PATH}
      backLabel="社員用ページのトップへ"
      loginHref="/training/portal"
    />
  );
}
