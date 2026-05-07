import type { ExpertReviewAssignmentStatus, Prisma, Role } from "@prisma/client";

import { createAuditLogEntry } from "@/lib/audit-log";

export const closeUnsubmittedReviewAssignments = async ({
  tx,
  packageId,
  operator,
  reason,
  status = "closed_by_admin",
}: {
  tx: Prisma.TransactionClient;
  packageId: string;
  operator: { id: string; role: Role };
  reason?: string | null;
  status?: Extract<ExpertReviewAssignmentStatus, "closed_by_admin">;
}) => {
  const pendingAssignments = await tx.expertReviewAssignment.findMany({
    where: {
      packageId,
      status: "pending",
      score: { is: null },
    },
    select: {
      id: true,
      expertUserId: true,
      status: true,
    },
  });

  if (pendingAssignments.length === 0) {
    return { closedCount: 0, closedAssignmentIds: [] as string[] };
  }

  const closedAssignmentIds = pendingAssignments.map((assignment) => assignment.id);

  await tx.expertReviewAssignment.updateMany({
    where: { id: { in: closedAssignmentIds } },
    data: { status },
  });

  await createAuditLogEntry({
    tx,
    operator,
    action: "expert_review_assignment.closed_by_admin",
    objectType: "expert_review_package",
    objectId: packageId,
    beforeState: {
      assignments: pendingAssignments,
    },
    afterState: {
      status,
      assignmentIds: closedAssignmentIds,
    },
    reason: reason ?? "管理员切换项目时关闭未提交专家任务",
  });

  return { closedCount: pendingAssignments.length, closedAssignmentIds };
};
