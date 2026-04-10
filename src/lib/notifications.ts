import type { Notification, Role, UserApprovalStatus } from "@prisma/client";

import { getEmailReminderSettings, isEmailReminderEnabled } from "@/lib/email-settings";
import { buildWorkspaceUrl, isEmailConfigured, renderSystemEmail, sendEmail } from "@/lib/email";
import { filterNotificationEmailRecipients } from "@/lib/notification-email-scope";
import { prisma } from "@/lib/prisma";

export type NotificationDeliveryResult = {
  notificationCount: number;
  emailRecipientCount: number;
  emailFailureCount: number;
  emailSkippedReason?: "disabled" | "no-recipient-email" | "setting-disabled";
  emailFailureReason?: "resend-domain-unverified" | "unknown";
};

const getEmailFailureReason = (error: unknown): NotificationDeliveryResult["emailFailureReason"] => {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("verify a domain") || message.includes("testing emails")) {
    return "resend-domain-unverified";
  }

  return "unknown";
};

type NotificationEmailRecipient = {
  id: string;
  email: string | null;
  name: string;
  role: Role;
  approvalStatus: UserApprovalStatus;
  teamGroupId?: string | null;
};

const getEmailErrorMessage = (
  reason: NotificationDeliveryResult["emailSkippedReason"] | NotificationDeliveryResult["emailFailureReason"],
) => {
  switch (reason) {
    case "disabled":
      return "邮件服务暂未配置";
    case "setting-disabled":
      return "当前邮件提醒设置已关闭";
    case "no-recipient-email":
      return "收件人未填写邮箱";
    case "resend-domain-unverified":
      return "Resend 发信域名尚未完成验证";
    case "unknown":
      return "邮件服务返回失败，请稍后重试";
    default:
      return null;
  }
};

const getSkippedEmailReason = (
  recipient: NotificationEmailRecipient | undefined,
  emailTeamGroupId: string | null | undefined,
) => {
  if (!recipient?.email?.trim()) {
    return "收件人未填写邮箱";
  }

  if (recipient.approvalStatus !== "approved") {
    return "账号尚未通过审核";
  }

  if (recipient.role === "admin") {
    return "系统管理员不接收此类邮件提醒";
  }

  if (emailTeamGroupId === null) {
    return "未指定项目组，不发送邮件";
  }

  if (emailTeamGroupId !== undefined && recipient.teamGroupId !== emailTeamGroupId) {
    return "非同项目组，不发送邮件";
  }

  return "本次未发送邮件";
};

const markEmailSkipped = async (
  notifications: Notification[],
  emailError: string,
) => {
  await Promise.all(
    notifications.map((notification) =>
      prisma.notification.update({
        where: { id: notification.id },
        data: {
          emailStatus: "skipped",
          emailError,
          emailSentAt: null,
        },
      }),
    ),
  );
};

export async function createNotifications({
  userIds,
  title,
  detail,
  type,
  targetTab,
  documentId,
  relatedId,
  senderId,
  email,
  emailTeamGroupId,
}: {
  userIds: string[];
  title: string;
  detail: string;
  type: string;
  targetTab?: string;
  documentId?: string | null;
  relatedId?: string | null;
  senderId?: string | null;
  email?: boolean | { subject?: string; actionLabel?: string; noticeType?: string };
  emailTeamGroupId?: string | null;
}): Promise<NotificationDeliveryResult> {
  const dedupedUserIds = [...new Set(userIds.filter(Boolean))];

  if (dedupedUserIds.length === 0) {
    return {
      notificationCount: 0,
      emailRecipientCount: 0,
      emailFailureCount: 0,
    };
  }

  const createdNotifications = await prisma.$transaction(
    dedupedUserIds.map((userId) =>
      prisma.notification.create({
        data: {
          userId,
          senderId: senderId ?? null,
          documentId: documentId ?? null,
          title,
          detail,
          type,
          targetTab: targetTab ?? null,
          relatedId: relatedId ?? null,
        },
      }),
    ),
  );

  if (!email) {
    return {
      notificationCount: dedupedUserIds.length,
      emailRecipientCount: 0,
      emailFailureCount: 0,
    };
  }

  const emailSettings = await getEmailReminderSettings();
  if (!isEmailReminderEnabled(emailSettings, type)) {
    await markEmailSkipped(createdNotifications, getEmailErrorMessage("setting-disabled") ?? "当前邮件提醒设置已关闭");

    return {
      notificationCount: dedupedUserIds.length,
      emailRecipientCount: 0,
      emailFailureCount: 0,
      emailSkippedReason: "setting-disabled",
    };
  }

  if (!isEmailConfigured()) {
    await markEmailSkipped(createdNotifications, getEmailErrorMessage("disabled") ?? "邮件服务暂未配置");

    return {
      notificationCount: dedupedUserIds.length,
      emailRecipientCount: 0,
      emailFailureCount: 0,
      emailSkippedReason: "disabled",
    };
  }

  const recipients = await prisma.user.findMany({
    where: {
      id: {
        in: dedupedUserIds,
      },
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      approvalStatus: true,
      teamGroupId: true,
    },
  });

  const recipientEmails = filterNotificationEmailRecipients(recipients, { emailTeamGroupId });
  const recipientByEmail = new Map(
    recipients
      .filter((recipient) => Boolean(recipient.email?.trim()))
      .map((recipient) => [recipient.email!.trim(), recipient]),
  );
  const notificationByUserId = new Map(createdNotifications.map((notification) => [notification.userId, notification]));
  const emailRecipients = recipientEmails.flatMap((recipient) => {
    const user = recipientByEmail.get(recipient.email);
    const notification = user ? notificationByUserId.get(user.id) : null;

    if (!user || !notification) {
      return [];
    }

    return [
      {
        ...recipient,
        notification,
      },
    ];
  });

  if (emailRecipients.length === 0) {
    await Promise.all(
      createdNotifications.map((notification) =>
        prisma.notification.update({
          where: { id: notification.id },
          data: {
            emailStatus: "skipped",
            emailError: getSkippedEmailReason(
              recipients.find((recipient) => recipient.id === notification.userId),
              emailTeamGroupId,
            ),
            emailSentAt: null,
          },
        }),
      ),
    );

    return {
      notificationCount: dedupedUserIds.length,
      emailRecipientCount: 0,
      emailFailureCount: 0,
      emailSkippedReason: "no-recipient-email",
    };
  }

  const emailOptions = typeof email === "object" ? email : {};
  const actionUrl = buildWorkspaceUrl(targetTab);

  const results = await Promise.allSettled(
    emailRecipients.map((recipient) =>
      sendEmail({
        to: recipient.email,
        subject: emailOptions.subject ?? title,
        html: renderSystemEmail({
          title,
          detail,
          actionUrl,
          actionLabel: emailOptions.actionLabel ?? "进入系统处理",
          recipientName: recipient.name,
          noticeType: emailOptions.noticeType,
        }),
      }),
    ),
  );

  const emailSentAt = new Date();
  const emailFailureCount = results.filter((result) => result.status === "rejected").length;
  const emailFailureReason = results.find((result) => result.status === "rejected");

  for (const [index, result] of results.entries()) {
    const notification = emailRecipients[index]?.notification;

    if (!notification) {
      continue;
    }

    if (result.status === "rejected") {
      console.error("Email notification failed", result.reason);
      await prisma.notification.update({
        where: { id: notification.id },
        data: {
          emailStatus: "failed",
          emailError: getEmailErrorMessage(getEmailFailureReason(result.reason)),
          emailSentAt: null,
        },
      });
    } else {
      await prisma.notification.update({
        where: { id: notification.id },
        data: {
          emailStatus: "sent",
          emailError: null,
          emailSentAt,
        },
      });
    }
  }

  const deliveredUserIds = new Set(emailRecipients.map((recipient) => recipient.notification.userId));
  await Promise.all(
    createdNotifications
      .filter((notification) => !deliveredUserIds.has(notification.userId))
      .map((notification) =>
        prisma.notification.update({
          where: { id: notification.id },
          data: {
            emailStatus: "skipped",
            emailError: getSkippedEmailReason(
              recipients.find((recipient) => recipient.id === notification.userId),
              emailTeamGroupId,
            ),
            emailSentAt: null,
          },
        }),
      ),
  );

  return {
    notificationCount: dedupedUserIds.length,
    emailRecipientCount: emailRecipients.length,
    emailFailureCount,
    emailFailureReason:
      emailFailureReason?.status === "rejected" ? getEmailFailureReason(emailFailureReason.reason) : undefined,
  };
}

export async function getUserIdsByRoles({
  roles,
  excludeUserIds = [],
  teamGroupId,
}: {
  roles: Role[];
  excludeUserIds?: string[];
  teamGroupId?: string | null;
}) {
  if (roles.length === 0) {
    return [];
  }

  const users = await prisma.user.findMany({
    where: {
      role: {
        in: roles,
      },
      id: {
        notIn: excludeUserIds,
      },
      ...(teamGroupId === undefined
        ? {}
        : teamGroupId
          ? { teamGroupId }
          : { id: "__no_team_group_recipients__" }),
    },
    select: {
      id: true,
    },
  });

  return users.map((user) => user.id);
}
