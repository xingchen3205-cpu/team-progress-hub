import type { Role } from "@prisma/client";

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
}: {
  userIds: string[];
  title: string;
  detail: string;
  type: string;
  targetTab?: string;
  documentId?: string | null;
  relatedId?: string | null;
  senderId?: string | null;
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
