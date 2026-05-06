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
  owner?: {
    teamGroupId?: string | null;
  } | null;
};

export const getEffectiveResourceTeamGroupId = (resource: TeamScopedResource) =>
  resource.teamGroupId ?? resource.owner?.teamGroupId ?? null;

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
        { teamGroupId: actor.teamGroupId },
        { owner: { teamGroupId: actor.teamGroupId } },
      ],
    };
  }

  return { ownerId: actor.id };
};

export const buildExpertReviewAssignmentVisibilityWhere = (actor: TeamScopedActor) => {
  if (actor.role === "expert") {
    return {
      expertUserId: actor.id,
      reviewPackage: {
        status: { not: "cancelled" as const },
      },
    };
  }

  if (hasGlobalAdminPrivileges(actor.role)) {
    return {
      reviewPackage: {
        status: { not: "cancelled" as const },
      },
    };
  }

  return {
    reviewPackage: {
      status: { not: "cancelled" as const },
      ...buildTeamScopedResourceWhere({
        actor,
        ownerField: "createdById",
        includeUnassignedForGroupedUsers: true,
      }),
    },
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

  const effectiveTeamGroupId = getEffectiveResourceTeamGroupId(resource);
  if (options?.allowUnassignedForGroupedUsers && actor.teamGroupId && effectiveTeamGroupId == null) {
    return true;
  }

  return Boolean(actor.teamGroupId && effectiveTeamGroupId === actor.teamGroupId);
};
