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
}: {
  actor: TeamScopedActor;
  ownerField: string;
  teamGroupField?: string;
}) => {
  if (hasGlobalAdminPrivileges(actor.role)) {
    return {};
  }

  if (actor.teamGroupId) {
    return {
      OR: [
        { [ownerField]: actor.id },
        { [teamGroupField]: actor.teamGroupId },
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
    return { expertUserId: actor.id };
  }

  if (hasGlobalAdminPrivileges(actor.role)) {
    return {};
  }

  return {
    reviewPackage: buildTeamScopedResourceWhere({
      actor,
      ownerField: "createdById",
    }),
  };
};

export const canAccessTeamScopedResource = (
  actor: TeamScopedActor,
  resource: TeamScopedResource,
) => {
  if (hasGlobalAdminPrivileges(actor.role)) {
    return true;
  }

  if (resource.ownerId && resource.ownerId === actor.id) {
    return true;
  }

  return Boolean(actor.teamGroupId && resource.teamGroupId === actor.teamGroupId);
};
