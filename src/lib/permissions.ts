import type { Role, UserApprovalStatus } from "@prisma/client";

export const roleLabels: Record<Role, "系统管理员" | "指导教师" | "项目负责人" | "团队成员" | "评审专家"> = {
  admin: "系统管理员",
  teacher: "指导教师",
  leader: "项目负责人",
  member: "团队成员",
  expert: "评审专家",
};

export const approvalStatusLabels: Record<UserApprovalStatus, "待审核" | "已通过"> = {
  pending: "待审核",
  approved: "已通过",
};

export const assertRole = (role: Role, allowed: Role[]) => {
  if (!allowed.includes(role)) {
    throw new Error("FORBIDDEN");
  }
};

export const assertExpertFeedbackAccess = (role: Role) => {
  assertRole(role, ["admin", "teacher", "leader", "member"]);
};

export const assertMainWorkspaceRole = (role: Role) => {
  assertRole(role, ["admin", "teacher", "leader", "member"]);
};

const roleRank: Record<Role, number> = {
  admin: 5,
  teacher: 4,
  leader: 3,
  member: 2,
  expert: 1,
};

export const selfRegisterableRoles: Role[] = ["teacher", "leader", "member", "expert"];

export const getRegistrationApproverRoles = (role: Role): Role[] | null => {
  switch (role) {
    case "teacher":
      return ["admin"];
    case "leader":
      return ["teacher", "admin"];
    case "member":
      return ["leader", "teacher", "admin"];
    case "expert":
      return ["teacher", "admin"];
    default:
      return null;
  }
};

export const canApproveRegistration = (actorRole: Role, targetRole: Role) => {
  const approverRoles = getRegistrationApproverRoles(targetRole);
  return Boolean(approverRoles?.includes(actorRole));
};

export const canViewTeamMember = (
  actorRole: Role,
  actorId: string,
  targetRole: Role,
  targetId: string,
) => {
  if (actorRole === "admin") {
    return true;
  }

  if (actorRole === "teacher") {
    return targetRole === "leader" || targetRole === "member" || targetRole === "expert";
  }

  if (actorRole === "leader") {
    return targetRole === "member";
  }

  if (actorRole === "member") {
    return actorId === targetId;
  }

  return actorId === targetId;
};

export const canManageUser = (
  actorRole: Role,
  targetRole: Role,
  nextRole?: Role,
) => {
  if (nextRole === "admin" && targetRole !== "admin") {
    return false;
  }

  if (targetRole === "admin") {
    return actorRole === "admin";
  }

  if (targetRole === "expert" || nextRole === "expert") {
    return actorRole === "admin" || actorRole === "teacher";
  }

  if (actorRole === "admin") {
    return true;
  }

  if (roleRank[actorRole] <= roleRank[targetRole]) {
    return false;
  }

  if (nextRole && roleRank[actorRole] <= roleRank[nextRole]) {
    return false;
  }

  return true;
};
