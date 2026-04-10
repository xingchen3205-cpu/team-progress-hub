import type { Role, UserApprovalStatus } from "@prisma/client";

export const roleLabels: Record<
  Role,
  "系统管理员" | "校级管理员" | "指导教师" | "项目负责人" | "团队成员" | "评审专家"
> = {
  admin: "系统管理员",
  school_admin: "校级管理员",
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

export const isSystemAdmin = (role: Role) => role === "admin";

export const isSchoolAdmin = (role: Role) => role === "school_admin";

export const hasGlobalAdminPrivileges = (role: Role) =>
  role === "admin" || role === "school_admin";

export const assertExpertFeedbackAccess = (role: Role) => {
  assertRole(role, ["admin", "school_admin", "teacher", "leader", "member"]);
};

export const assertMainWorkspaceRole = (role: Role) => {
  assertRole(role, ["admin", "school_admin", "teacher", "leader", "member"]);
};

const roleRank: Record<Role, number> = {
  admin: 6,
  school_admin: 5,
  teacher: 4,
  leader: 3,
  member: 2,
  expert: 1,
};

export const selfRegisterableRoles: Role[] = ["teacher", "leader", "member", "expert"];

export const getRegistrationApproverRoles = (role: Role): Role[] | null => {
  switch (role) {
    case "teacher":
      return ["school_admin", "admin"];
    case "leader":
      return ["teacher", "school_admin", "admin"];
    case "member":
      return ["leader", "teacher", "school_admin", "admin"];
    case "expert":
      return ["teacher", "school_admin", "admin"];
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
  if (hasGlobalAdminPrivileges(actorRole)) {
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
  if (nextRole === "admin" && actorRole !== "admin") {
    return false;
  }

  if (nextRole === "school_admin" && actorRole !== "admin") {
    return false;
  }

  if (nextRole === "admin" && targetRole !== "admin") {
    return false;
  }

  if (targetRole === "admin") {
    return actorRole === "admin";
  }

  if (targetRole === "school_admin") {
    return actorRole === "admin";
  }

  if (actorRole === "school_admin") {
    if (nextRole && (nextRole === "admin" || nextRole === "school_admin")) {
      return false;
    }
  }

  if (targetRole === "expert" || nextRole === "expert") {
    return hasGlobalAdminPrivileges(actorRole) || actorRole === "teacher";
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
