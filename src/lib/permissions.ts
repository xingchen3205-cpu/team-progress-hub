import type { Role } from "@prisma/client";

export const roleLabels: Record<Role, "指导教师" | "项目负责人" | "团队成员"> = {
  teacher: "指导教师",
  leader: "项目负责人",
  member: "团队成员",
};

export const assertRole = (role: Role, allowed: Role[]) => {
  if (!allowed.includes(role)) {
    throw new Error("FORBIDDEN");
  }
};

export const canManageUser = (
  actorRole: Role,
  targetRole: Role,
  nextRole?: Role,
) => {
  if (actorRole === "teacher") {
    return true;
  }

  if (actorRole === "leader") {
    if (targetRole !== "member") {
      return false;
    }

    if (nextRole && nextRole !== "member") {
      return false;
    }

    return true;
  }

  return false;
};
