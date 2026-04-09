import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { filterNotificationEmailRecipients } from "../src/lib/notification-email-scope";

describe("notification email recipient filtering", () => {
  const recipients = [
    {
      id: "admin-1",
      email: "admin@example.com",
      name: "系统管理员",
      role: "admin",
      approvalStatus: "approved",
      teamGroupId: null,
    },
    {
      id: "teacher-a",
      email: "teacher-a@example.com",
      name: "指导教师A",
      role: "teacher",
      approvalStatus: "approved",
      teamGroupId: "group-a",
    },
    {
      id: "leader-a",
      email: "leader-a@example.com",
      name: "负责人A",
      role: "leader",
      approvalStatus: "approved",
      teamGroupId: "group-a",
    },
    {
      id: "member-b",
      email: "member-b@example.com",
      name: "成员B",
      role: "member",
      approvalStatus: "approved",
      teamGroupId: "group-b",
    },
    {
      id: "pending-a",
      email: "pending-a@example.com",
      name: "待审核A",
      role: "member",
      approvalStatus: "pending",
      teamGroupId: "group-a",
    },
    {
      id: "no-email-a",
      email: null,
      name: "无邮箱A",
      role: "member",
      approvalStatus: "approved",
      teamGroupId: "group-a",
    },
  ] as const;

  it("excludes admins and keeps only approved users with email in the same team group", () => {
    assert.deepEqual(
      filterNotificationEmailRecipients(recipients, { emailTeamGroupId: "group-a" }),
      [
        { email: "teacher-a@example.com", name: "指导教师A" },
        { email: "leader-a@example.com", name: "负责人A" },
      ],
    );
  });

  it("sends no emails when a notification is explicitly outside any team group", () => {
    assert.deepEqual(filterNotificationEmailRecipients(recipients, { emailTeamGroupId: null }), []);
  });

  it("still excludes admins when no team group limit is provided", () => {
    assert.deepEqual(
      filterNotificationEmailRecipients(recipients, {}),
      [
        { email: "teacher-a@example.com", name: "指导教师A" },
        { email: "leader-a@example.com", name: "负责人A" },
        { email: "member-b@example.com", name: "成员B" },
      ],
    );
  });
});
