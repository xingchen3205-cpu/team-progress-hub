import type { Prisma, Role } from "@prisma/client";

const auditStateSoftLimit = 64 * 1024;

export type AuditOperator = {
  id: string;
  role: Role;
};

export const requiresAuditReason = (action: string) =>
  new Set([
    "expert_review_package.reset",
    "review_display_seat.excluded",
    "expert_review_package.archive_reverted",
  ]).has(action);

export const normalizeAuditReason = (reason?: string | null) => {
  const normalized = reason?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
};

export const serializeAuditState = (value: unknown) => {
  if (value == null) {
    return null;
  }

  const text = JSON.stringify(value);
  if (text.length <= auditStateSoftLimit) {
    return text;
  }

  return JSON.stringify({
    truncated: true,
    byteLength: Buffer.byteLength(text),
    note: "审计详情超过 64KB，完整数据请查看业务历史表。",
  });
};

export const createAuditLogEntry = async ({
  tx,
  operator,
  action,
  objectType,
  objectId,
  teamGroupId,
  beforeState,
  afterState,
  reason,
  metadata,
}: {
  tx: Prisma.TransactionClient;
  operator: AuditOperator;
  action: string;
  objectType: string;
  objectId: string;
  teamGroupId?: string | null;
  beforeState?: unknown;
  afterState?: unknown;
  reason?: string | null;
  metadata?: unknown;
}) => {
  const normalizedReason = normalizeAuditReason(reason);

  if (requiresAuditReason(action) && !normalizedReason) {
    throw new Error("该操作必须填写原因");
  }

  return tx.auditLog.create({
    data: {
      operatorId: operator.id,
      operatorRole: operator.role,
      action,
      objectType,
      objectId,
      teamGroupId: teamGroupId ?? null,
      beforeState: serializeAuditState(beforeState),
      afterState: serializeAuditState(afterState),
      reason: normalizedReason,
      metadata: serializeAuditState(metadata),
    },
  });
};
