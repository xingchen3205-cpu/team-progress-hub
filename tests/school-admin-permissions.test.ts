import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertMainWorkspaceRole,
  canApproveRegistration,
  canDeleteUser,
  canManageUser,
  canResetUserPassword,
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

  it("keeps registration approval reserved to system and school administrators", () => {
    assert.equal(canApproveRegistration("admin", "teacher"), true);
    assert.equal(canApproveRegistration("admin", "leader"), true);
    assert.equal(canApproveRegistration("admin", "member"), true);
    assert.equal(canApproveRegistration("teacher", "leader"), false);
    assert.equal(canApproveRegistration("teacher", "member"), false);
    assert.equal(canApproveRegistration("leader", "member"), false);
    assert.equal(canApproveRegistration("member", "member"), false);
  });

  it("keeps account deletion reserved to system and school administrators", () => {
    assert.equal(canDeleteUser("admin", "school_admin"), true);
    assert.equal(canDeleteUser("admin", "teacher"), true);
    assert.equal(canDeleteUser("admin", "leader"), true);
    assert.equal(canDeleteUser("admin", "member"), true);
    assert.equal(canDeleteUser("admin", "expert"), true);
    assert.equal(canDeleteUser("school_admin", "teacher"), true);
    assert.equal(canDeleteUser("school_admin", "leader"), true);
    assert.equal(canDeleteUser("school_admin", "member"), true);
    assert.equal(canDeleteUser("school_admin", "expert"), true);
    assert.equal(canDeleteUser("school_admin", "admin"), false);
    assert.equal(canDeleteUser("school_admin", "school_admin"), false);
    assert.equal(canDeleteUser("teacher", "leader"), false);
    assert.equal(canDeleteUser("teacher", "member"), false);
    assert.equal(canDeleteUser("leader", "member"), false);
    assert.equal(canDeleteUser("member", "member"), false);
  });

  it("keeps account password resets reserved to system and school administrators", () => {
    assert.equal(canResetUserPassword("admin", "school_admin"), true);
    assert.equal(canResetUserPassword("admin", "teacher"), true);
    assert.equal(canResetUserPassword("admin", "leader"), true);
    assert.equal(canResetUserPassword("admin", "member"), true);
    assert.equal(canResetUserPassword("admin", "expert"), true);
    assert.equal(canResetUserPassword("admin", "admin"), false);
    assert.equal(canResetUserPassword("school_admin", "teacher"), true);
    assert.equal(canResetUserPassword("school_admin", "leader"), true);
    assert.equal(canResetUserPassword("school_admin", "member"), true);
    assert.equal(canResetUserPassword("school_admin", "expert"), true);
    assert.equal(canResetUserPassword("school_admin", "admin"), false);
    assert.equal(canResetUserPassword("school_admin", "school_admin"), false);
    assert.equal(canResetUserPassword("teacher", "leader"), false);
    assert.equal(canResetUserPassword("teacher", "member"), false);
    assert.equal(canResetUserPassword("leader", "member"), false);
    assert.equal(canResetUserPassword("member", "member"), false);
  });

  it("lets school administrators view approved team members globally", () => {
    assert.equal(canViewTeamMember("school_admin", "viewer-1", "teacher", "teacher-1"), true);
    assert.equal(canViewTeamMember("school_admin", "viewer-1", "expert", "expert-1"), true);
  });
});
