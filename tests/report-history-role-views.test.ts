import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { getReportsViewRole, getVisibleReportMembers } from "@/lib/report-history";

test("reports roles collapse into student, teacher, and admin views", () => {
  assert.equal(getReportsViewRole("member"), "student");
  assert.equal(getReportsViewRole("leader"), "student");
  assert.equal(getReportsViewRole("teacher"), "teacher");
  assert.equal(getReportsViewRole("school_admin"), "admin");
  assert.equal(getReportsViewRole("admin"), "admin");
});

test("students can see project leaders and members in their scoped team, not just themselves", () => {
  const visibleMembers = getVisibleReportMembers({
    members: [
      { id: "leader-1", systemRole: "项目负责人", teamGroupId: "group-a" },
      { id: "member-1", systemRole: "团队成员", teamGroupId: "group-a" },
      { id: "member-2", systemRole: "团队成员", teamGroupId: "group-a" },
      { id: "teacher-1", systemRole: "指导教师", teamGroupId: "group-a" },
      { id: "member-3", systemRole: "团队成员", teamGroupId: "group-b" },
    ],
    currentMemberId: "member-1",
    viewerRole: "member",
    viewerTeamGroupId: "group-a",
  });

  assert.deepEqual(
    visibleMembers.map((member) => member.id),
    ["leader-1", "member-1", "member-2"],
  );
});

test("teachers can see the bound group report members without exposing other roles", () => {
  const visibleMembers = getVisibleReportMembers({
    members: [
      { id: "leader-1", systemRole: "项目负责人", teamGroupId: "group-a" },
      { id: "member-1", systemRole: "团队成员", teamGroupId: "group-a" },
      { id: "teacher-1", systemRole: "指导教师", teamGroupId: "group-a" },
      { id: "member-2", systemRole: "团队成员", teamGroupId: "group-b" },
    ],
    currentMemberId: "teacher-1",
    viewerRole: "teacher",
    viewerTeamGroupId: "group-a",
  });

  assert.deepEqual(
    visibleMembers.map((member) => member.id),
    ["leader-1", "member-1"],
  );
});

test("admins can down-drill into a selected team group while keeping the same member rules", () => {
  const visibleMembers = getVisibleReportMembers({
    members: [
      { id: "leader-a", systemRole: "项目负责人", teamGroupId: "group-a" },
      { id: "member-a", systemRole: "团队成员", teamGroupId: "group-a" },
      { id: "leader-b", systemRole: "项目负责人", teamGroupId: "group-b" },
      { id: "member-b", systemRole: "团队成员", teamGroupId: "group-b" },
      { id: "teacher-b", systemRole: "指导教师", teamGroupId: "group-b" },
    ],
    currentMemberId: "admin-1",
    viewerRole: "admin",
    selectedTeamGroupId: "group-b",
  });

  assert.deepEqual(
    visibleMembers.map((member) => member.id),
    ["leader-b", "member-b"],
  );
});

test("schedule tab exposes shared report components and role-specific report views", () => {
  const scheduleSource = readFileSync(
    path.join(process.cwd(), "src/components/tabs/schedule-tab.tsx"),
    "utf8",
  );

  assert.match(scheduleSource, /const DateSelector =/);
  assert.match(scheduleSource, /const ReportCard =/);
  assert.match(scheduleSource, /const SearchBar =/);
  assert.match(scheduleSource, /const StudentReportsView =/);
  assert.match(scheduleSource, /const TeacherReportsView =/);
  assert.match(scheduleSource, /const AdminReportsView =/);
  assert.match(scheduleSource, /reportsViewRole === "student"/);
  assert.match(scheduleSource, /reportsViewRole === "teacher"/);
  assert.match(scheduleSource, /reportsViewRole === "admin"/);
});

test("teacher and admin reports views expose the new operational sections", () => {
  const scheduleSource = readFileSync(
    path.join(process.cwd(), "src/components/tabs/schedule-tab.tsx"),
    "utf8",
  );

  assert.match(scheduleSource, /我负责的项目组/);
  assert.match(scheduleSource, /AI 日报摘要/);
  assert.match(scheduleSource, /需要关注/);
  assert.match(scheduleSource, /成员汇报列表/);
  assert.match(scheduleSource, /全校概览/);
  assert.match(scheduleSource, /项目组健康度总览/);
  assert.match(scheduleSource, /教师活跃度排行/);
  assert.match(scheduleSource, /本周趋势/);
});
