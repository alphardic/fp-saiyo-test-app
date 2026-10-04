import { redirect } from "next/navigation";

/** 旧作問ページ。社員用ポータル(ログイン制)に移行したため転送する。 */
export default function TrainingAuthorLegacyPage() {
  redirect("/training/portal");
}
