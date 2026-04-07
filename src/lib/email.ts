const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://xingchencxcy.com";

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

export const isEmailConfigured = () => Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM);

export const buildWorkspaceUrl = (targetTab?: string | null) => {
  if (!targetTab || targetTab === "overview") {
    return `${appUrl}/workspace`;
  }

  return `${appUrl}/workspace?tab=${encodeURIComponent(targetTab)}`;
};

export const renderSystemEmail = ({
  title,
  detail,
  actionUrl,
  actionLabel = "进入系统查看",
}: {
  title: string;
  detail: string;
  actionUrl: string;
  actionLabel?: string;
}) => `
  <div style="margin:0;background:#f1f5f9;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a;">
    <div style="margin:0 auto;max-width:560px;border:1px solid #e2e8f0;border-radius:16px;background:#ffffff;overflow:hidden;">
      <div style="padding:24px 28px;border-bottom:1px solid #e2e8f0;">
        <p style="margin:0 0 8px;color:#2563eb;font-size:13px;font-weight:700;letter-spacing:.04em;">中国国际大学生创新大赛管理系统</p>
        <h1 style="margin:0;font-size:20px;line-height:1.45;color:#0f172a;">${escapeHtml(title)}</h1>
      </div>
      <div style="padding:24px 28px;">
        <p style="margin:0 0 22px;font-size:15px;line-height:1.8;color:#475569;white-space:pre-line;">${escapeHtml(detail)}</p>
        <a href="${escapeHtml(actionUrl)}" style="display:inline-block;border-radius:10px;background:#1d4ed8;padding:12px 18px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;">${escapeHtml(actionLabel)}</a>
        <p style="margin:22px 0 0;font-size:12px;line-height:1.7;color:#94a3b8;">如果按钮无法打开，请复制链接到浏览器访问：<br>${escapeHtml(actionUrl)}</p>
      </div>
    </div>
  </div>
`;

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;

  if (!apiKey || !from || !to) {
    return { skipped: true };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      html,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || "邮件发送失败");
  }

  return response.json().catch(() => ({ ok: true }));
}
