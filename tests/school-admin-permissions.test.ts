import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertMainWorkspaceRole,
  canApproveRegistration,
  canManageUser,
  canViewTeamMember,
  roleLabels,
} from "../src/lib/permissions";

describe("school admin permissions", () => {
  it("exposes a dedicated label for school administrators", () => {
    assert.equal(roleLabels.school_admin, "校级管理员");
  });

  it("treats school administrators as main workspace users", () => {
    assert.doesNotThrow(() => assertMainWorkspaceRole("school_admin"));
  });

  it("allows system administrators to manage school administrators", () => {
    assert.equal(canManageUser("admin", "school_admin"), true);
    assert.equal(canManageUser("admin", "teacher", "school_admin"), true);
  });

  it("lets school administrators manage lower roles only", () => {
    assert.equal(canManageUser("school_admin", "teacher"), true);
    assert.equal(canManageUser("school_admin", "leader"), true);
    assert.equal(canManageUser("school_admin", "member"), true);
    assert.equal(canManageUser("school_admin", "expert"), true);
    assert.equal(canManageUser("school_admin", "admin"), false);
    assert.equal(canManageUser("school_admin", "school_admin"), false);
    assert.equal(canManageUser("school_admin", "teacher", "school_admin"), false);
    assert.equal(canManageUser("school_admin", "teacher", "admin"), false);
  });

  it("allows school administrators to approve lower-role registrations", () => {
    assert.equal(canApproveRegistration("school_admin", "teacher"), true);
    assert.equal(canApproveRegistration("school_admin", "leader"), true);
    assert.equal(canApproveRegistration("school_admin", "member"), true);
    assert.equal(canApproveRegistration("school_admin", "expert"), false);
  });

  it("lets school administrators view approved team members globally", () => {
    assert.equal(canViewTeamMember("school_admin", "viewer-1", "teacher", "teacher-1"), true);
    assert.equal(canViewTeamMember("school_admin", "viewer-1", "expert", "expert-1"), true);
  });
});
