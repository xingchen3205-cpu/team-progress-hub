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
  assert.match(scheduleSource, /const AdminReadonlyReportCard =/);
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
  assert.match(scheduleSource, /需要关注/);
  assert.match(scheduleSource, /成员汇报列表/);
  assert.match(scheduleSource, /全校概览/);
  assert.match(scheduleSource, /项目组健康度总览/);
  assert.match(scheduleSource, /教师活跃度排行/);
  assert.match(scheduleSource, /趋势分析/);
});

test("member cards keep latest submitted report visible and use localized role labels", () => {
  const scheduleSource = readFileSync(
    path.join(process.cwd(), "src/components/tabs/schedule-tab.tsx"),
    "utf8",
  );

  assert.match(scheduleSource, /最近一次汇报/);
  assert.match(scheduleSource, /member\.systemRole/);
});

test("trend charts expose axis ticks and hoverable numeric labels", () => {
  const scheduleSource = readFileSync(
    path.join(process.cwd(), "src/components/tabs/schedule-tab.tsx"),
    "utf8",
  );

  assert.match(scheduleSource, /const buildChartTicks =/);
  assert.match(scheduleSource, /<title>/);
});

test("admin teacher filter matches groups bound to any selected teacher", () => {
  const scheduleSource = readFileSync(
    path.join(process.cwd(), "src/components/tabs/schedule-tab.tsx"),
    "utf8",
  );

  assert.match(scheduleSource, /teacherNames/);
  assert.match(scheduleSource, /teacherNames\.includes\(teacherFilter\)/);
});

test("admin health filters use project group instead of college and grade", () => {
  const scheduleSource = readFileSync(
    path.join(process.cwd(), "src/components/tabs/schedule-tab.tsx"),
    "utf8",
  );

  assert.doesNotMatch(scheduleSource, /全部学院/);
  assert.doesNotMatch(scheduleSource, /全部年级/);
  assert.match(scheduleSource, /全部项目组/);
});

test("admin view conditionally shows teacher board only for dual role users", () => {
  const scheduleSource = readFileSync(
    path.join(process.cwd(), "src/components/tabs/schedule-tab.tsx"),
    "utf8",
  );

  assert.match(scheduleSource, /我作为教师负责的项目组/);
  assert.match(scheduleSource, /canShowTeacherBoard/);
});

test("admin overview shows progress count before deadline and rate after deadline", () => {
  const scheduleSource = readFileSync(
    path.join(process.cwd(), "src/components/tabs/schedule-tab.tsx"),
    "utf8",
  );

  assert.match(scheduleSource, /今日进度/);
  assert.match(scheduleSource, /昨日提交率/);
  assert.match(scheduleSource, /REPORT_DEADLINE_HOUR/);
});

test("admin trend section supports week month semester range toggle", () => {
  const scheduleSource = readFileSync(
    path.join(process.cwd(), "src/components/tabs/schedule-tab.tsx"),
    "utf8",
  );

  assert.match(scheduleSource, /本周/);
  assert.match(scheduleSource, /本月/);
  assert.match(scheduleSource, /本学期/);
  assert.match(scheduleSource, /trendRange/);
});

test("admin charts show empty state when less than 3 days of data", () => {
  const scheduleSource = readFileSync(
    path.join(process.cwd(), "src/components/tabs/schedule-tab.tsx"),
    "utf8",
  );

  assert.match(scheduleSource, /数据积累中，3 天后显示趋势/);
});

test("admin teacher activity empty state suggests action with notify button", () => {
  const scheduleSource = readFileSync(
    path.join(process.cwd(), "src/components/tabs/schedule-tab.tsx"),
    "utf8",
  );

  assert.match(scheduleSource, /本周尚无教师发起点评/);
  assert.match(scheduleSource, /提醒全体指导教师/);
});

test("admin tools expose bulk remind export and cleanup in horizontal layout", () => {
  const scheduleSource = readFileSync(
    path.join(process.cwd(), "src/components/tabs/schedule-tab.tsx"),
    "utf8",
  );

  assert.match(scheduleSource, /批量催交/);
  assert.match(scheduleSource, /导出周报/);
  assert.match(scheduleSource, /数据清理/);
});

test("admin data cleanup requires confirmation before execution", () => {
  const scheduleSource = readFileSync(
    path.join(process.cwd(), "src/components/tabs/schedule-tab.tsx"),
    "utf8",
  );

  assert.match(scheduleSource, /确认删除/);
  assert.match(scheduleSource, /setConfirmDialog/);
});

test("admin trend section shows three metric cards and one main chart", () => {
  const scheduleSource = readFileSync(
    path.join(process.cwd(), "src/components/tabs/schedule-tab.tsx"),
    "utf8",
  );

  assert.match(scheduleSource, /本周平均提交率/);
  assert.match(scheduleSource, /本周总点评数/);
  assert.match(scheduleSource, /本周总红花数/);
  assert.match(scheduleSource, /MainTrendChart/);
});

test("admin reports view uses high-fidelity governance dashboard sections", () => {
  const scheduleSource = readFileSync(
    path.join(process.cwd(), "src/components/tabs/schedule-tab.tsx"),
    "utf8",
  );

  assert.match(scheduleSource, /admin-reports-dashboard/);
  assert.match(scheduleSource, /admin-overview-card/);
  assert.match(scheduleSource, /admin-overview-rate/);
  assert.match(scheduleSource, /admin-compare-card/);
  assert.match(scheduleSource, /admin-health-row/);
  assert.match(scheduleSource, /admin-health-progress/);
  assert.match(scheduleSource, /admin-teacher-rank-card/);
  assert.match(scheduleSource, /admin-warning-soft-card/);
  assert.match(scheduleSource, /admin-trend-layout/);
  assert.match(scheduleSource, /admin-trend-stat-card/);
  assert.match(scheduleSource, /admin-management-tools/);
});

test("admin trend section handles flat or zero data gracefully", () => {
  const scheduleSource = readFileSync(
    path.join(process.cwd(), "src/components/tabs/schedule-tab.tsx"),
    "utf8",
  );

  assert.match(scheduleSource, /本周暂无点评活动/);
});

test("admin health overview supports expand collapse with member cards", () => {
  const scheduleSource = readFileSync(
    path.join(process.cwd(), "src/components/tabs/schedule-tab.tsx"),
    "utf8",
  );

  assert.match(scheduleSource, /收起/);
  assert.match(scheduleSource, /AdminReadonlyReportCard/);
});

test("admin search supports student and teacher detail drawers", () => {
  const scheduleSource = readFileSync(
    path.join(process.cwd(), "src/components/tabs/schedule-tab.tsx"),
    "utf8",
  );

  assert.match(scheduleSource, /RightDrawer/);
  assert.match(scheduleSource, /studentDrawer/);
  assert.match(scheduleSource, /teacherDrawer/);
});

test("admin health overview exposes random inspection entry", () => {
  const scheduleSource = readFileSync(
    path.join(process.cwd(), "src/components/tabs/schedule-tab.tsx"),
    "utf8",
  );

  assert.match(scheduleSource, /随机抽查/);
});

test("admin expanded group uses read-only view without teacher evaluation buttons", () => {
  const scheduleSource = readFileSync(
    path.join(process.cwd(), "src/components/tabs/schedule-tab.tsx"),
    "utf8",
  );

  assert.doesNotMatch(scheduleSource, /AdminReadonlyReportCard.*点赞/);
  assert.doesNotMatch(scheduleSource, /AdminReadonlyReportCard.*待改进/);
  assert.doesNotMatch(scheduleSource, /AdminReadonlyReportCard.*批注/);
});

test("student view has four key sections", () => {
  const scheduleSource = readFileSync(
    path.join(process.cwd(), "src/components/tabs/schedule-tab.tsx"),
    "utf8",
  );

  assert.match(scheduleSource, /我的今日汇报/);
  assert.match(scheduleSource, /我收到的评价/);
  assert.match(scheduleSource, /我的成就面板/);
  assert.match(scheduleSource, /项目组今日动态/);
});

test("student view has focused submit entry and streak reminder", () => {
  const scheduleSource = readFileSync(
    path.join(process.cwd(), "src/components/tabs/schedule-tab.tsx"),
    "utf8",
  );

  assert.match(scheduleSource, /立即提交今日汇报/);
  assert.match(scheduleSource, /连续提交第/);
});

test("student achievement panel shows four metrics", () => {
  const scheduleSource = readFileSync(
    path.join(process.cwd(), "src/components/tabs/schedule-tab.tsx"),
    "utf8",
  );

  assert.match(scheduleSource, /连续提交/);
  assert.match(scheduleSource, /本月提交率/);
  assert.match(scheduleSource, /红花数/);
  assert.match(scheduleSource, /当前排名/);
});

test("student teammate list uses accordion instead of card wall", () => {
  const scheduleSource = readFileSync(
    path.join(process.cwd(), "src/components/tabs/schedule-tab.tsx"),
    "utf8",
  );

  assert.match(scheduleSource, /expandedTeammateId/);
});

test("student view removes duplicated empty state stacking", () => {
  const scheduleSource = readFileSync(
    path.join(process.cwd(), "src/components/tabs/schedule-tab.tsx"),
    "utf8",
  );

  assert.doesNotMatch(scheduleSource, /StudentReportsView.*这一天还没有汇报/);
});

test("student evaluation section has unread read handling", () => {
  const scheduleSource = readFileSync(
    path.join(process.cwd(), "src/components/tabs/schedule-tab.tsx"),
    "utf8",
  );

  assert.match(scheduleSource, /isRead/);
  assert.match(scheduleSource, /mark_read/);
});

test("student history date shows makeup label and hides countdown", () => {
  const scheduleSource = readFileSync(
    path.join(process.cwd(), "src/components/tabs/schedule-tab.tsx"),
    "utf8",
  );

  assert.match(scheduleSource, /补交/);
  assert.match(scheduleSource, /selectedDate !== todayDateKey/);
});

test("student view keeps DateSelector at the top before my today report", () => {
  const scheduleSource = readFileSync(
    path.join(process.cwd(), "src/components/tabs/schedule-tab.tsx"),
    "utf8",
  );

  const studentStart = scheduleSource.indexOf("const StudentReportsView");
  const studentEnd = scheduleSource.indexOf("const GroupOperationsBoard", studentStart);
  const studentView = scheduleSource.slice(studentStart, studentEnd);

  const dateSelectorIndex = studentView.indexOf("<DateSelector");
  const myReportIndex = studentView.indexOf("我的今日汇报");

  assert.ok(dateSelectorIndex > -1, "StudentReportsView should contain DateSelector");
  assert.ok(myReportIndex > -1, "StudentReportsView should contain 我的今日汇报");
  assert.ok(
    dateSelectorIndex < myReportIndex,
    "DateSelector should appear before 我的今日汇报 in StudentReportsView",
  );
});

test("student achievement streak badge has 7 30 100 tier thresholds", () => {
  const scheduleSource = readFileSync(
    path.join(process.cwd(), "src/components/tabs/schedule-tab.tsx"),
    "utf8",
  );

  assert.match(scheduleSource, />= 100/);
  assert.match(scheduleSource, />= 30/);
  assert.match(scheduleSource, />= 7/);
});

test("teacher view removes AI daily summary and related states", () => {
  const scheduleSource = readFileSync(
    path.join(process.cwd(), "src/components/tabs/schedule-tab.tsx"),
    "utf8",
  );

  assert.doesNotMatch(scheduleSource, /AI 日报摘要/);
  assert.doesNotMatch(scheduleSource, /生成中\.\.\./);
  assert.doesNotMatch(scheduleSource, /最近更新/);
  assert.doesNotMatch(scheduleSource, /已切换为本地摘要/);
});

test("teacher view no longer calls api ai chat from GroupOperationsBoard", () => {
  const scheduleSource = readFileSync(
    path.join(process.cwd(), "src/components/tabs/schedule-tab.tsx"),
    "utf8",
  );

  const teacherStart = scheduleSource.indexOf("const GroupOperationsBoard");
  const teacherEnd = scheduleSource.indexOf("const TeacherReportsView", teacherStart);
  const teacherBlock = scheduleSource.slice(teacherStart, teacherEnd);

  assert.doesNotMatch(teacherBlock, /\/api\/ai\/chat/);
  assert.doesNotMatch(teacherBlock, /refreshSummary/);
  assert.doesNotMatch(teacherBlock, /summaryState/);
});

test("teacher view keeps core blocks and members list before trend", () => {
  const scheduleSource = readFileSync(
    path.join(process.cwd(), "src/components/tabs/schedule-tab.tsx"),
    "utf8",
  );

  const teacherStart = scheduleSource.indexOf("const GroupOperationsBoard");
  const teacherEnd = scheduleSource.indexOf("const TeacherReportsView", teacherStart);
  const teacherBlock = scheduleSource.slice(teacherStart, teacherEnd);

  assert.match(teacherBlock, /需要关注/);
  assert.match(teacherBlock, /成员汇报列表/);
  assert.match(teacherBlock, /本组本周趋势/);

  const membersIndex = teacherBlock.indexOf("成员汇报列表");
  const trendIndex = teacherBlock.indexOf("本组本周趋势");
  assert.ok(membersIndex > -1);
  assert.ok(trendIndex > -1);
  assert.ok(membersIndex < trendIndex, "成员汇报列表 should appear before 本组本周趋势");
});

test("teacher view follows template header and overview structure", () => {
  const scheduleSource = readFileSync(
    path.join(process.cwd(), "src/components/tabs/schedule-tab.tsx"),
    "utf8",
  );

  assert.match(scheduleSource, /教师视角/);
  assert.match(scheduleSource, /我负责的项目组/);
  assert.match(scheduleSource, /今日提交/);
  assert.match(scheduleSource, /本周提交率/);
  assert.match(scheduleSource, /本周获赞/);
  assert.match(scheduleSource, /全校项目组排名/);
});

test("teacher view uses compact member report controls from template", () => {
  const scheduleSource = readFileSync(
    path.join(process.cwd(), "src/components/tabs/schedule-tab.tsx"),
    "utf8",
  );

  assert.match(scheduleSource, /待点评/);
  assert.match(scheduleSource, /未提交/);
  assert.match(scheduleSource, /▲ 点赞/);
  assert.match(scheduleSource, /关键词预警/);
  assert.match(scheduleSource, /连续 3 天未提交/);
});

test("teacher trend panel uses metric cards plus one main chart layout", () => {
  const scheduleSource = readFileSync(
    path.join(process.cwd(), "src/components/tabs/schedule-tab.tsx"),
    "utf8",
  );

  assert.match(scheduleSource, /本周平均提交率/);
  assert.match(scheduleSource, /本周累计获赞/);
  assert.match(scheduleSource, /本周点评发起/);
  assert.match(scheduleSource, /每日提交率/);
});
