import type { Role } from "@prisma/client";

export const roleLabels: Record<Role, "系统管理员" | "指导教师" | "项目负责人" | "团队成员"> = {
  admin: "系统管理员",
  teacher: "指导教师",
  leader: "项目负责人",
  member: "团队成员",
};

export const assertRole = (role: Role, allowed: Role[]) => {
  if (!allowed.includes(role)) {
    throw new Error("FORBIDDEN");
  }
};

export const assertExpertFeedbackAccess = (role: Role) => {
  assertRole(role, ["admin", "teacher", "leader", "member"]);
};

const roleRank: Record<Role, number> = {
  admin: 4,
  teacher: 3,
  leader: 2,
  member: 1,
};

export const canManageUser = (
  actorRole: Role,
  targetRole: Role,
  nextRole?: Role,
) => {
  if (targetRole === "admin") {
    return actorRole === "admin";
  }

  if (actorRole === "admin") {
    return true;
  }

  if (nextRole === "admin") {
    return false;
  }

  if (roleRank[actorRole] <= roleRank[targetRole]) {
    return false;
  }

  if (nextRole && roleRank[actorRole] <= roleRank[nextRole]) {
    return false;
  }

  return true;
};
