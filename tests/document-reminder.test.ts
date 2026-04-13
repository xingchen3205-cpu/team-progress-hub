import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  canTriggerDocumentReminder,
  getDocumentReminderLabel,
  getDocumentReminderRecipientIds,
  getDocumentReminderTargetRoles,
} from "../src/lib/document-reminder";

describe("document reminder workflow", () => {
  it("targets project leaders for pending documents and teachers for final review", () => {
    assert.deepEqual(getDocumentReminderTargetRoles("pending"), ["leader"]);
    assert.deepEqual(getDocumentReminderTargetRoles("leader_approved"), ["teacher"]);
    assert.deepEqual(getDocumentReminderTargetRoles("approved"), []);
  });

  it("only allows teacher or admin-side roles to send reminders on active review stages", () => {
    assert.equal(canTriggerDocumentReminder({ actorRole: "teacher", statusKey: "pending" }), true);
    assert.equal(canTriggerDocumentReminder({ actorRole: "admin", statusKey: "leader_approved" }), true);
    assert.equal(canTriggerDocumentReminder({ actorRole: "leader", statusKey: "pending" }), false);
    assert.equal(canTriggerDocumentReminder({ actorRole: "teacher", statusKey: "approved" }), false);
  });

  it("excludes the current user and users outside the current team group", () => {
    assert.deepEqual(
      getDocumentReminderRecipientIds({
        statusKey: "leader_approved",
        currentUserId: "teacher-1",
        currentTeamGroupId: "group-a",
        teamMembers: [
          {
            id: "teacher-1",
            name: "李老师",
            role: "teacher",
            roleLabel: "指导教师",
            username: "teacher1",
            password: "hidden",
            avatar: "李",
            approvalStatus: "approved",
            teamGroupId: "group-a",
          },
          {
            id: "teacher-2",
            name: "周老师",
            role: "teacher",
            roleLabel: "指导教师",
            username: "teacher2",
            password: "hidden",
            avatar: "周",
            approvalStatus: "approved",
            teamGroupId: "group-a",
          },
          {
            id: "teacher-3",
            name: "外组老师",
            role: "teacher",
            roleLabel: "指导教师",
            username: "teacher3",
            password: "hidden",
            avatar: "外",
            approvalStatus: "approved",
            teamGroupId: "group-b",
          },
        ],
      }),
      ["teacher-2"],
    );
  });

  it("uses explicit reminder labels for each review stage", () => {
    assert.equal(getDocumentReminderLabel("pending"), "提醒负责人");
    assert.equal(getDocumentReminderLabel("leader_approved"), "提醒教师终审");
  });
});
