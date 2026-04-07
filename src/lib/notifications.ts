import type { Role } from "@prisma/client";

import { buildWorkspaceUrl, isEmailConfigured, renderSystemEmail, sendEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";

export type NotificationDeliveryResult = {
  notificationCount: number;
  emailRecipientCount: number;
  emailFailureCount: number;
  emailSkippedReason?: "disabled" | "no-recipient-email";
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
}: {
  userIds: string[];
  title: string;
  detail: string;
  type: string;
  targetTab?: string;
  documentId?: string | null;
  relatedId?: string | null;
  senderId?: string | null;
  email?: boolean | { subject?: string; actionLabel?: string };
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
    },
  });

  const recipientEmails = recipients
    .map((recipient) => recipient.email?.trim())
    .filter((recipientEmail): recipientEmail is string => Boolean(recipientEmail));

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
  const html = renderSystemEmail({
    title,
    detail,
    actionUrl,
    actionLabel: emailOptions.actionLabel,
  });

  const results = await Promise.allSettled(
    recipientEmails.map((recipientEmail) =>
      sendEmail({
        to: recipientEmail,
        subject: emailOptions.subject ?? title,
        html,
      }),
    ),
  );

  const emailFailureCount = results.filter((result) => result.status === "rejected").length;

  for (const result of results) {
    if (result.status === "rejected") {
      console.error("Email notification failed", result.reason);
    }
  }

  return {
    notificationCount: dedupedUserIds.length,
    emailRecipientCount: recipientEmails.length,
    emailFailureCount,
  };
}

export async function getUserIdsByRoles({
  roles,
  excludeUserIds = [],
}: {
  roles: Role[];
  excludeUserIds?: string[];
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
    },
    select: {
      id: true,
    },
  });

  return users.map((user) => user.id);
}
