const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://xingchencxcy.com";

export const systemEmailProductName = "南京铁道职业技术学院中国国际大学生创新大赛管理系统";

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
  actionLabel = "进入系统办理",
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
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>系统工作提醒单</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:'Microsoft YaHei',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:30px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:4px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:#1a3a6b;padding:20px 32px;">
              <div style="color:#ffffff;font-size:18px;font-weight:bold;letter-spacing:1px;">
                ${escapeHtml(systemEmailProductName)}
              </div>
              <div style="color:#a8c4e8;font-size:13px;margin-top:4px;">
                系统工作提醒单
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px 8px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:10px 0;border-bottom:1px solid #eef0f3;width:100px;color:#888;font-size:13px;vertical-align:top;">收件人</td>
                  <td style="padding:10px 0;border-bottom:1px solid #eef0f3;color:#222;font-size:14px;">${escapeHtml(recipientName)}</td>
                </tr>
                <tr>
                  <td style="padding:10px 0;border-bottom:1px solid #eef0f3;color:#888;font-size:13px;vertical-align:top;">事项类型</td>
                  <td style="padding:10px 0;border-bottom:1px solid #eef0f3;color:#222;font-size:14px;">${escapeHtml(noticeType)}</td>
                </tr>
                <tr>
                  <td style="padding:10px 0;border-bottom:1px solid #eef0f3;color:#888;font-size:13px;vertical-align:top;">事项标题</td>
                  <td style="padding:10px 0;border-bottom:1px solid #eef0f3;color:#1a3a6b;font-size:14px;font-weight:bold;">${escapeHtml(title)}</td>
                </tr>
                <tr>
                  <td style="padding:10px 0;border-bottom:1px solid #eef0f3;color:#888;font-size:13px;vertical-align:top;">办理要求</td>
                  <td style="padding:10px 0;border-bottom:1px solid #eef0f3;color:#222;font-size:14px;line-height:1.7;white-space:pre-line;">${escapeHtml(detail)}</td>
                </tr>
                <tr>
                  <td style="padding:10px 0;border-bottom:1px solid #eef0f3;color:#888;font-size:13px;vertical-align:top;">办理入口</td>
                  <td style="padding:10px 0;border-bottom:1px solid #eef0f3;font-size:14px;">
                    <a href="${escapeHtml(actionUrl)}" style="display:inline-block;background:#1a3a6b;color:#ffffff;padding:7px 20px;border-radius:3px;text-decoration:none;font-size:13px;">${escapeHtml(actionLabel)}</a>
                  </td>
                </tr>
                <tr>
                  <td style="padding:10px 0;color:#888;font-size:13px;vertical-align:top;">发送时间</td>
                  <td style="padding:10px 0;color:#aaa;font-size:13px;">${escapeHtml(formatEmailDateTime(sentAt))}</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background:#f8f9fb;border-top:1px solid #eef0f3;padding:16px 32px;text-align:center;color:#aaa;font-size:12px;">
              本邮件由${escapeHtml(systemEmailProductName)}自动发送，请勿直接回复。
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
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
