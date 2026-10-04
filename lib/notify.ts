const NOTIFY_TO = "saiyo_kyoiku@alpha-fp.com";
const DASHBOARD_URL = "https://fp-saiyo-test-app.tanaka-a6c.workers.dev/admin";

/**
 * 候補者が受験(回答提出)を完了したタイミングで、採用担当宛てに通知メールを送る。
 * Resend APIを使用。送信に失敗しても例外は投げず、ログに残すだけにする
 * (通知メールの失敗で候補者の提出自体を失敗させないため)。
 */
export async function sendSubmissionNotification(params: {
  candidateName: string;
  candidateEmail: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("RESEND_API_KEY が設定されていないため、通知メールをスキップしました。");
    return;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: "FP業界 入社適性テスト <onboarding@resend.dev>",
        to: [NOTIFY_TO],
        subject: `【入社適性テスト】${params.candidateName}様が受験を完了しました`,
        html: `
          <p>以下の候補者が入社適性テストの回答を提出しました。</p>
          <table cellpadding="6" style="border-collapse:collapse">
            <tr><td style="color:#64748b">氏名</td><td>${escapeHtml(params.candidateName)}</td></tr>
            <tr><td style="color:#64748b">メールアドレス</td><td>${escapeHtml(params.candidateEmail)}</td></tr>
          </table>
          <p>採点結果・レポートは管理画面からご確認ください。</p>
          <p><a href="${DASHBOARD_URL}">${DASHBOARD_URL}</a></p>
        `,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`通知メールの送信に失敗しました(${res.status}): ${text.slice(0, 300)}`);
    }
  } catch (e) {
    console.error("通知メール送信中にエラーが発生しました:", e);
  }
}

const TRAINING_NOTIFY_TO = "saiyo_kyoiku@alpha-fp.com";

/**
 * 分野別社内テストの受験(採点)が完了したタイミングで、指定のメールアドレスへ結果を通知する。
 * Resend APIを使用。送信に失敗しても例外は投げず、ログに残すだけにする
 * (通知メールの失敗で受験者の提出自体を失敗させないため)。
 */
export async function sendTrainingResultNotification(params: {
  employeeName: string;
  employeeEmail: string;
  courseName: string;
  score: number;
  total: number;
  passed: boolean;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("RESEND_API_KEY が設定されていないため、通知メールをスキップしました。");
    return;
  }

  const resultLabel = params.passed ? "合格" : "不合格";

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: "分野別社内テスト <onboarding@resend.dev>",
        to: [TRAINING_NOTIFY_TO],
        subject: `【${escapeHtml(params.courseName)}】${params.employeeName}様が受験しました(${resultLabel}・${params.score}/${params.total})`,
        html: `
          <p>以下の社員が分野別社内テストを受験しました。</p>
          <table cellpadding="6" style="border-collapse:collapse">
            <tr><td style="color:#64748b">テスト</td><td>${escapeHtml(params.courseName)}</td></tr>
            <tr><td style="color:#64748b">氏名</td><td>${escapeHtml(params.employeeName)}</td></tr>
            <tr><td style="color:#64748b">メールアドレス</td><td>${escapeHtml(params.employeeEmail)}</td></tr>
            <tr><td style="color:#64748b">結果</td><td>${resultLabel}(${params.score} / ${params.total}問正解)</td></tr>
          </table>
        `,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`通知メールの送信に失敗しました(${res.status}): ${text.slice(0, 300)}`);
    }
  } catch (e) {
    console.error("通知メール送信中にエラーが発生しました:", e);
  }
}

/**
 * 未受験・受験中のまま止まっている候補者へ、管理画面からのボタン操作で
 * リマインドメールを送る。管理者が内容・宛先を都度確認したうえで送信する運用のため、
 * 通知メールと異なり成否をそのまま呼び出し元に返す。
 */
export async function sendReminderEmail(params: {
  candidateName: string;
  candidateEmail: string;
  testName: string;
  examUrl: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "RESEND_API_KEYが設定されていません。" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: "FP業界 入社適性テスト <onboarding@resend.dev>",
        to: [params.candidateEmail],
        subject: `【${params.testName}】ご回答のお願い`,
        html: `
          <p>${escapeHtml(params.candidateName)} 様</p>
          <p>お忙しいところ恐れ入ります。まだ${escapeHtml(params.testName)}にご回答いただいていないようでしたので、ご案内いたします。</p>
          <p>ご回答内容は自動的に保存されますので、途中で中断されても次回は続きからご回答いただけます。</p>
          <p><a href="${params.examUrl}">${params.examUrl}</a></p>
          <p>ご不明な点があればお気軽にご連絡ください。</p>
        `,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `送信に失敗しました(${res.status}): ${text.slice(0, 300)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "不明なエラーが発生しました。" };
  }
}

/**
 * 社員が作った社内テストの承認申請・承認結果を通知する。
 * 送信に失敗しても例外は投げず、ログに残すだけにする(申請・承認の操作自体は失敗させないため)。
 */
/** 社員が作った社内テストの承認者(承認申請の通知先) */
const AUTHORING_APPROVER_EMAIL = "tanaka@alpha-fp.com";

async function sendAuthoringMail(params: { to: string; subject: string; html: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("RESEND_API_KEY が設定されていないため、通知メールをスキップしました。");
    return;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        from: "分野別社内テスト <onboarding@resend.dev>",
        to: [params.to],
        subject: params.subject,
        html: params.html,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`通知メールの送信に失敗しました(${res.status}): ${text.slice(0, 300)}`);
    }
  } catch (e) {
    console.error("通知メール送信中にエラーが発生しました:", e);
  }
}

export async function sendAuthoringSubmittedNotification(params: {
  courseName: string;
  authorName: string;
  reviewUrl: string;
}): Promise<void> {
  await sendAuthoringMail({
    to: AUTHORING_APPROVER_EMAIL,
    subject: `【承認申請】${params.authorName}さんが社内テスト「${params.courseName}」の承認を申請しました`,
    html: `
      <p>${escapeHtml(params.authorName)}さんが、社内テスト「${escapeHtml(params.courseName)}」の承認を申請しました。</p>
      <p>内容を確認し、承認または差し戻しをしてください。</p>
      <p><a href="${params.reviewUrl}">${params.reviewUrl}</a></p>
    `,
  });
}

/** 社員が作ったテストの配布開始を管理者に知らせる(承認は不要。事後確認用) */
export async function sendAuthoringPublishedNotification(params: {
  courseName: string;
  authorName: string;
  reviewUrl: string;
}): Promise<void> {
  await sendAuthoringMail({
    to: AUTHORING_APPROVER_EMAIL,
    subject: `【配布開始】${params.authorName}さんが社内テスト「${params.courseName}」の配布を始めました`,
    html: `
      <p>${escapeHtml(params.authorName)}さんが、社内テスト「${escapeHtml(params.courseName)}」の配布を始めました。</p>
      <p>問題と受験結果は、次のページから確認できます。</p>
      <p><a href="${params.reviewUrl}">${params.reviewUrl}</a></p>
    `,
  });
}

export async function sendAuthoringDecisionNotification(params: {
  to: string;
  authorName: string;
  courseName: string;
  approved: boolean;
  comment: string;
  editorUrl: string;
}): Promise<void> {
  const label = params.approved ? "承認されました" : "差し戻されました";
  await sendAuthoringMail({
    to: params.to,
    subject: `【社内テスト】「${params.courseName}」が${label}`,
    html: `
      <p>${escapeHtml(params.authorName)}さん</p>
      <p>作成した社内テスト「${escapeHtml(params.courseName)}」が${label}。</p>
      ${params.comment ? `<p>コメント:<br>${escapeHtml(params.comment).replace(/\n/g, "<br>")}</p>` : ""}
      <p><a href="${params.editorUrl}">${params.editorUrl}</a></p>
    `,
  });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}