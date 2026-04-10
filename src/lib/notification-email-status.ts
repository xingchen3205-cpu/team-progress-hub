export type NotificationEmailStatusKey = "sent" | "failed" | "skipped" | null | undefined;

export type NotificationEmailStatusTone = "success" | "danger" | "muted";

export const getNotificationEmailStatusMeta = (
  status: NotificationEmailStatusKey,
  error?: string | null,
): {
  label: string;
  tone: NotificationEmailStatusTone;
  detail: string;
} => {
  if (status === "sent") {
    return {
      label: "邮件已发送",
      tone: "success",
      detail: "对方邮箱已收到本次提醒。",
    };
  }

  if (status === "failed") {
    return {
      label: "邮件发送失败",
      tone: "danger",
      detail: error?.trim() || "邮件服务返回失败，请检查发信配置后重试。",
    };
  }

  if (!status) {
    return {
      label: "邮件状态未记录",
      tone: "muted",
      detail: "历史提醒未记录邮件发送结果。",
    };
  }

  return {
    label: "未发送邮件",
    tone: "muted",
    detail: error?.trim() || "本次只发送了站内提醒。",
  };
};
