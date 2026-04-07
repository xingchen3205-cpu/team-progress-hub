import type { Role } from "@prisma/client";

import { buildWorkspaceUrl, renderSystemEmail, sendEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";

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
}) {
  const dedupedUserIds = [...new Set(userIds.filter(Boolean))];

  if (dedupedUserIds.length === 0) {
    return;
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
    return;
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

  const emailOptions = typeof email === "object" ? email : {};
  const actionUrl = buildWorkspaceUrl(targetTab);
  const html = renderSystemEmail({
    title,
    detail,
    actionUrl,
    actionLabel: emailOptions.actionLabel,
  });

  const results = await Promise.allSettled(
    recipients
      .map((recipient) => recipient.email)
      .filter((recipientEmail): recipientEmail is string => Boolean(recipientEmail))
      .map((recipientEmail) =>
        sendEmail({
          to: recipientEmail,
          subject: emailOptions.subject ?? title,
          html,
        }),
      ),
  );

  for (const result of results) {
    if (result.status === "rejected") {
      console.error("Email notification failed", result.reason);
    }
  }
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
