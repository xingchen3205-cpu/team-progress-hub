import type { Role } from "@prisma/client";

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

  await prisma.notification.createMany({
    data: dedupedUserIds.map((userId) => ({
      userId,
      senderId: senderId ?? null,
      documentId: documentId ?? null,
      title,
      detail,
      type,
      targetTab: targetTab ?? null,
      relatedId: relatedId ?? null,
    })),
  });

  if (!email) {
    return {
      notificationCount: dedupedUserIds.length,
      emailRecipientCount: 0,
      emailFailureCount: 0,
    };
  }

  const emailSettings = await getEmailReminderSettings();
  if (!isEmailReminderEnabled(emailSettings, type)) {
    return {
      notificationCount: dedupedUserIds.length,
      emailRecipientCount: 0,
      emailFailureCount: 0,
      emailSkippedReason: "setting-disabled",
    };
  }

  if (!isEmailConfigured()) {
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
      email: {
        not: null,
      },
      approvalStatus: "approved",
    },
    select: {
      email: true,
      name: true,
      role: true,
      approvalStatus: true,
      teamGroupId: true,
    },
  });

  const recipientEmails = filterNotificationEmailRecipients(recipients, { emailTeamGroupId });

  if (recipientEmails.length === 0) {
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
    recipientEmails.map((recipient) =>
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

  const emailFailureCount = results.filter((result) => result.status === "rejected").length;
  const emailFailureReason = results.find((result) => result.status === "rejected");

  for (const result of results) {
    if (result.status === "rejected") {
      console.error("Email notification failed", result.reason);
    }
  }

  return {
    notificationCount: dedupedUserIds.length,
    emailRecipientCount: recipientEmails.length,
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
