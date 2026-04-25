import type { Role } from "@prisma/client";

import { hasGlobalAdminPrivileges } from "@/lib/permissions";

type TeamScopedActor = {
  id: string;
  role: Role;
  teamGroupId?: string | null;
};

type TeamScopedResource = {
  ownerId?: string | null;
  teamGroupId?: string | null;
};

export const buildTeamScopedResourceWhere = ({
  actor,
  ownerField,
  teamGroupField = "teamGroupId",
  includeUnassignedForGroupedUsers = false,
}: {
  actor: TeamScopedActor;
  ownerField: string;
  teamGroupField?: string;
  includeUnassignedForGroupedUsers?: boolean;
}) => {
  if (hasGlobalAdminPrivileges(actor.role)) {
    return {};
  }

  if (actor.teamGroupId) {
    return {
      OR: [
        { [ownerField]: actor.id },
        { [teamGroupField]: actor.teamGroupId },
        ...(includeUnassignedForGroupedUsers ? [{ [teamGroupField]: null }] : []),
      ],
    };
  }

  return { [ownerField]: actor.id };
};

export const buildDocumentVisibilityWhere = (actor: TeamScopedActor) => {
  if (hasGlobalAdminPrivileges(actor.role)) {
    return {};
  }

  if (actor.teamGroupId) {
    return {
      OR: [
        { ownerId: actor.id },
        { owner: { teamGroupId: actor.teamGroupId } },
      ],
    };
  }

  return { ownerId: actor.id };
};

export const buildExpertReviewAssignmentVisibilityWhere = (actor: TeamScopedActor) => {
  if (actor.role === "expert") {
    const now = new Date();
    return {
      expertUserId: actor.id,
      reviewPackage: {
        OR: [
          { deadline: null },
          { deadline: { gt: now } },
        ],
      },
    };
  }

  if (hasGlobalAdminPrivileges(actor.role)) {
    return {};
  }

  return {
    reviewPackage: buildTeamScopedResourceWhere({
      actor,
      ownerField: "createdById",
      includeUnassignedForGroupedUsers: true,
    }),
  };
};

export const canAccessTeamScopedResource = (
  actor: TeamScopedActor,
  resource: TeamScopedResource,
  options?: {
    allowUnassignedForGroupedUsers?: boolean;
  },
) => {
  if (hasGlobalAdminPrivileges(actor.role)) {
    return true;
  }

  if (resource.ownerId && resource.ownerId === actor.id) {
    return true;
  }

  if (options?.allowUnassignedForGroupedUsers && actor.teamGroupId && resource.teamGroupId == null) {
    return true;
  }

  return Boolean(actor.teamGroupId && resource.teamGroupId === actor.teamGroupId);
};
