import type { DocumentStatus, Role } from "@prisma/client";

export type DocumentReviewAction =
  | "leaderApprove"
  | "leaderRevision"
  | "teacherApprove"
  | "teacherRevision";

export const isPrivilegedReviewer = (role: Role) => role === "admin" || role === "teacher";

export const canHandleLeaderStage = (role: Role) => role === "leader" || role === "admin";

export const canHandleTeacherStage = (role: Role) => role === "teacher" || role === "admin";

export const getUploadWorkflow = (role: Role, isNewVersion = false) => {
  if (role === "teacher" || role === "admin") {
    return {
      status: "approved" as DocumentStatus,
      comment: isNewVersion
        ? "指导教师已上传新版本并完成终审。"
        : "指导教师已上传文档并完成终审。",
      notificationTargetRoles: [] as Role[],
    };
  }

  if (role === "leader") {
    return {
      status: "leader_approved" as DocumentStatus,
      comment: isNewVersion
        ? "项目负责人已上传新版本，等待指导教师终审。"
        : "项目负责人已上传文档，等待指导教师终审。",
      notificationTargetRoles: ["teacher", "admin"] as Role[],
    };
  }

  return {
    status: "pending" as DocumentStatus,
    comment: isNewVersion
      ? "成员已上传新版本，等待项目负责人审批。"
      : "成员已上传文档，等待项目负责人审批。",
    notificationTargetRoles: ["leader", "admin"] as Role[],
  };
};

export const getDocumentReviewTransition = ({
  actorRole,
  currentStatus,
  action,
}: {
  actorRole: Role;
  currentStatus: DocumentStatus;
  action: DocumentReviewAction;
}) => {
  if (action === "leaderApprove" || action === "leaderRevision") {
    if (!canHandleLeaderStage(actorRole)) {
      return null;
    }

    if (currentStatus !== "pending") {
      return null;
    }

    return action === "leaderApprove"
      ? {
          nextStatus: "leader_approved" as DocumentStatus,
          defaultComment: "项目负责人已审核通过，等待指导教师终审。",
          notificationTargetRoles: ["teacher", "admin"] as Role[],
          notificationTitle: "文档待教师终审",
        }
      : {
          nextStatus: "leader_revision" as DocumentStatus,
          defaultComment: "项目负责人打回修改，请根据意见更新材料。",
          notificationTargetRoles: [] as Role[],
          notificationTitle: "文档被负责人打回",
        };
  }

  if (!canHandleTeacherStage(actorRole) || currentStatus !== "leader_approved") {
    return null;
  }

  return action === "teacherApprove"
    ? {
        nextStatus: "approved" as DocumentStatus,
        defaultComment: "指导教师已终审通过，可进入最终提交阶段。",
        notificationTargetRoles: [] as Role[],
        notificationTitle: "文档终审通过",
      }
    : {
        nextStatus: "revision" as DocumentStatus,
        defaultComment: "指导教师打回修改，请根据批注重新提交。",
        notificationTargetRoles: [] as Role[],
        notificationTitle: "文档被教师打回",
      };
};

export const canDeleteDocument = ({
  actorRole,
  actorId,
  ownerId,
  status,
}: {
  actorRole: Role;
  actorId: string;
  ownerId: string;
  status: DocumentStatus;
}) => {
  if (isPrivilegedReviewer(actorRole)) {
    return true;
  }

  if (actorId !== ownerId) {
    return false;
  }

  return status !== "approved";
};

export const canDeleteDocumentVersion = ({
  actorRole,
  actorId,
  ownerId,
  uploaderId,
  status,
}: {
  actorRole: Role;
  actorId: string;
  ownerId: string;
  uploaderId: string;
  status: DocumentStatus;
}) => {
  if (isPrivilegedReviewer(actorRole)) {
    return true;
  }

  if (status === "approved") {
    return false;
  }

  return actorId === ownerId || actorId === uploaderId;
};
