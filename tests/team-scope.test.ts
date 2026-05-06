import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildDocumentVisibilityWhere,
  buildExpertReviewAssignmentVisibilityWhere,
  buildTeamScopedResourceWhere,
  canAccessTeamScopedResource,
} from "../src/lib/team-scope";

describe("team-scoped workspace visibility", () => {
  it("limits ungrouped users to resources they created or own", () => {
    assert.deepEqual(
      buildTeamScopedResourceWhere({
        actor: { id: "user-1", role: "teacher", teamGroupId: null },
        ownerField: "authorId",
      }),
      { authorId: "user-1" },
    );

    assert.deepEqual(
      buildDocumentVisibilityWhere({ id: "user-1", role: "member", teamGroupId: null }),
      { ownerId: "user-1" },
    );
  });

  it("lets grouped users see their own team resources without crossing teams", () => {
    assert.deepEqual(
      buildTeamScopedResourceWhere({
        actor: { id: "teacher-1", role: "teacher", teamGroupId: "group-a" },
        ownerField: "createdById",
      }),
      { OR: [{ createdById: "teacher-1" }, { teamGroupId: "group-a" }] },
    );

    assert.deepEqual(
      buildDocumentVisibilityWhere({ id: "member-1", role: "member", teamGroupId: "group-a" }),
      { OR: [{ ownerId: "member-1" }, { teamGroupId: "group-a" }, { owner: { teamGroupId: "group-a" } }] },
    );

    assert.deepEqual(
      buildExpertReviewAssignmentVisibilityWhere({
        id: "leader-1",
        role: "leader",
        teamGroupId: "group-a",
      }),
      {
        reviewPackage: {
          OR: [{ createdById: "leader-1" }, { teamGroupId: "group-a" }, { teamGroupId: null }],
          status: { not: "cancelled" },
        },
      },
    );
  });

  it("keeps expert review packages isolated for experts and ungrouped users", () => {
    const expertWhere = buildExpertReviewAssignmentVisibilityWhere({
        id: "expert-1",
        role: "expert",
        teamGroupId: null,
    });

    assert.equal(expertWhere.expertUserId, "expert-1");
    assert.deepEqual(expertWhere.reviewPackage, { status: { not: "cancelled" } });

    assert.deepEqual(
      buildExpertReviewAssignmentVisibilityWhere({
        id: "teacher-without-team",
        role: "teacher",
        teamGroupId: null,
      }),
      {
        reviewPackage: {
          createdById: "teacher-without-team",
          status: { not: "cancelled" },
        },
      },
    );
  });

  it("grants admins global access but rejects cross-team resources for normal users", () => {
    assert.deepEqual(
      buildTeamScopedResourceWhere({
        actor: { id: "admin-1", role: "admin", teamGroupId: null },
        ownerField: "createdById",
      }),
      {},
    );

    assert.equal(
      canAccessTeamScopedResource(
        { id: "teacher-1", role: "teacher", teamGroupId: "group-a" },
        { ownerId: "other-user", teamGroupId: "group-b" },
      ),
      false,
    );
    assert.equal(
      canAccessTeamScopedResource(
        { id: "teacher-1", role: "teacher", teamGroupId: "group-a" },
        { ownerId: "other-user", teamGroupId: "group-a" },
      ),
      true,
    );
    assert.equal(
      canAccessTeamScopedResource(
        { id: "teacher-1", role: "teacher", teamGroupId: "group-a" },
        { ownerId: "other-user", teamGroupId: null, owner: { teamGroupId: "group-a" } },
      ),
      true,
    );
    assert.equal(
      canAccessTeamScopedResource(
        { id: "teacher-1", role: "teacher", teamGroupId: "group-a" },
        { ownerId: "admin-1", teamGroupId: null },
        { allowUnassignedForGroupedUsers: true },
      ),
      true,
    );
  });

  it("can include unassigned global records for grouped viewers when explicitly enabled", () => {
    assert.deepEqual(
      buildTeamScopedResourceWhere({
        actor: { id: "teacher-1", role: "teacher", teamGroupId: "group-a" },
        ownerField: "createdById",
        includeUnassignedForGroupedUsers: true,
      }),
      { OR: [{ createdById: "teacher-1" }, { teamGroupId: "group-a" }, { teamGroupId: null }] },
    );

    assert.deepEqual(
      buildTeamScopedResourceWhere({
        actor: { id: "teacher-without-team", role: "teacher", teamGroupId: null },
        ownerField: "createdById",
        includeUnassignedForGroupedUsers: true,
      }),
      { createdById: "teacher-without-team" },
    );
  });
});
