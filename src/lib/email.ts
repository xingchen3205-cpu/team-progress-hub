const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://xingchencxcy.com";

export const buildAppUrl = (path = "/") => {
  if (/^https?:\/\//.test(path)) {
    return path;
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${appUrl}${normalizedPath}`;
};

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const emailDateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const formatEmailDateTime = (value: Date | string) => {
  const date = typeof value === "string" ? new Date(value) : value;
  return emailDateTimeFormatter.format(date).replace(/\s+/g, " ");
};

export const isEmailConfigured = () => Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM);

export const buildWorkspaceUrl = (targetTab?: string | null) => {
  if (!targetTab || targetTab === "overview") {
    return buildAppUrl("/workspace");
  }

  return buildAppUrl(`/workspace?tab=${encodeURIComponent(targetTab)}`);
};

export const renderSystemEmail = ({
  title,
  detail,
  actionUrl,
  actionLabel = "进入系统查看",
  recipientName = "系统用户",
  noticeType = "工作提醒",
  sentAt = new Date(),
}: {
  title: string;
  detail: string;
  actionUrl: string;
  actionLabel?: string;
  recipientName?: string;
  noticeType?: string;
  sentAt?: Date | string;
}) => `
  <div style="margin:0;background:#f4f7fb;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Microsoft YaHei',sans-serif;color:#0f172a;">
    <div style="margin:0 auto;max-width:640px;border:1px solid #dbe3ef;border-radius:14px;background:#ffffff;overflow:hidden;box-shadow:0 8px 24px rgba(15,23,42,.08);">
      <div style="padding:26px 32px 22px;border-bottom:4px solid #1d4ed8;background:#ffffff;">
        <p style="margin:0;color:#1d4ed8;font-size:14px;font-weight:700;letter-spacing:.08em;">中国国际大学生创新大赛管理系统</p>
        <h1 style="margin:10px 0 0;font-size:24px;line-height:1.4;color:#0f172a;">工作提醒单</h1>
        <p style="margin:8px 0 0;font-size:13px;color:#64748b;">请及时登录系统查看并处理相关事项</p>
      </div>
      <div style="padding:26px 32px 30px;">
        <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;font-size:14px;line-height:1.8;">
          <tbody>
            <tr>
              <th style="width:108px;background:#f8fafc;border-bottom:1px solid #e2e8f0;padding:10px 14px;text-align:left;color:#334155;font-weight:700;">收件人</th>
              <td style="border-bottom:1px solid #e2e8f0;padding:10px 14px;color:#0f172a;">${escapeHtml(recipientName)}</td>
            </tr>
            <tr>
              <th style="background:#f8fafc;border-bottom:1px solid #e2e8f0;padding:10px 14px;text-align:left;color:#334155;font-weight:700;">事项类型</th>
              <td style="border-bottom:1px solid #e2e8f0;padding:10px 14px;color:#0f172a;">${escapeHtml(noticeType)}</td>
            </tr>
            <tr>
              <th style="background:#f8fafc;border-bottom:1px solid #e2e8f0;padding:10px 14px;text-align:left;color:#334155;font-weight:700;">事项标题</th>
              <td style="border-bottom:1px solid #e2e8f0;padding:10px 14px;color:#0f172a;font-weight:700;">${escapeHtml(title)}</td>
            </tr>
            <tr>
              <th style="background:#f8fafc;border-bottom:1px solid #e2e8f0;padding:10px 14px;text-align:left;color:#334155;font-weight:700;vertical-align:top;">办理要求</th>
              <td style="border-bottom:1px solid #e2e8f0;padding:10px 14px;color:#334155;white-space:pre-line;">${escapeHtml(detail)}</td>
            </tr>
            <tr>
              <th style="background:#f8fafc;border-bottom:1px solid #e2e8f0;padding:10px 14px;text-align:left;color:#334155;font-weight:700;vertical-align:top;">办理入口</th>
              <td style="border-bottom:1px solid #e2e8f0;padding:10px 14px;color:#334155;">
                <a href="${escapeHtml(actionUrl)}" style="display:inline-block;border-radius:8px;background:#1d4ed8;padding:10px 16px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;">${escapeHtml(actionLabel)}</a>
                <p style="margin:10px 0 0;font-size:12px;line-height:1.6;color:#64748b;">如按钮无法打开，请复制链接访问：<br>${escapeHtml(actionUrl)}</p>
              </td>
            </tr>
            <tr>
              <th style="background:#f8fafc;padding:10px 14px;text-align:left;color:#334155;font-weight:700;">发送时间</th>
              <td style="padding:10px 14px;color:#0f172a;">${escapeHtml(formatEmailDateTime(sentAt))}</td>
            </tr>
          </tbody>
        </table>
        <p style="margin:20px 0 0;border-top:1px solid #e2e8f0;padding-top:16px;font-size:12px;line-height:1.7;color:#94a3b8;">本邮件由系统自动发送，请勿直接回复。</p>
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
