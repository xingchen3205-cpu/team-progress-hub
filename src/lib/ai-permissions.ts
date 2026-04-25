import type { Role } from "@prisma/client";

export type AiPermissionLike = {
  isEnabled: boolean;
  maxCount: number | null;
  usedCount: number;
  resetAt: Date | null;
};

export type AiPermissionSnapshot = {
  isEnabled: boolean;
  maxCount: number | null;
  usedCount: number;
  remainingCount: number | null;
  resetAt: Date | null;
  shouldReset: boolean;
};

const resetExpiredUsage = (permission: AiPermissionLike | null, now: Date) => {
  if (!permission) {
    return permission;
  }

  if (!permission.resetAt || permission.resetAt.getTime() > now.getTime()) {
    return permission;
  }

  return {
    ...permission,
    usedCount: 0,
    resetAt: null,
  } satisfies AiPermissionLike;
};

export function buildAiPermissionSnapshot(
  role: Role,
  permission: AiPermissionLike | null,
  now = new Date(),
): AiPermissionSnapshot {
  if (role === "expert") {
    return {
      isEnabled: false,
      maxCount: 0,
      usedCount: 0,
      remainingCount: 0,
      resetAt: null,
      shouldReset: false,
    };
  }

  const normalizedPermission = resetExpiredUsage(permission, now);
  const shouldReset = Boolean(permission?.resetAt && permission.resetAt.getTime() <= now.getTime());

  if (!normalizedPermission) {
    if (role === "admin" || role === "school_admin") {
      return {
        isEnabled: true,
        maxCount: null,
        usedCount: 0,
        remainingCount: null,
        resetAt: null,
        shouldReset: false,
      };
    }

    return {
      isEnabled: false,
      maxCount: 0,
      usedCount: 0,
      remainingCount: 0,
      resetAt: null,
      shouldReset: false,
    };
  }

  const maxCount = normalizedPermission.maxCount ?? null;
  const usedCount = Math.max(0, normalizedPermission.usedCount);
  const remainingCount = maxCount == null ? null : Math.max(0, maxCount - usedCount);

  return {
    isEnabled: normalizedPermission.isEnabled,
    maxCount,
    usedCount,
    remainingCount,
    resetAt: normalizedPermission.resetAt ?? null,
    shouldReset,
  };
}

export function resolveAiAccessState(snapshot: AiPermissionSnapshot) {
  if (!snapshot.isEnabled) {
    return "disabled" as const;
  }

  if (snapshot.remainingCount != null && snapshot.remainingCount <= 0) {
    return "limit_reached" as const;
  }

  return "allowed" as const;
}

export function parseAiMaxCountInput(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  if (!normalized) {
    return null;
  }

  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error("次数上限必须是大于等于 0 的整数");
  }

  return parsed;
}
