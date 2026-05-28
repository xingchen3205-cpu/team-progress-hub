import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

test("teacher provincial training has isolated durable models", () => {
  const schema = read("prisma/schema.prisma");

  assert.match(schema, /model TeacherTrainingCohort/);
  assert.match(schema, /model TeacherTrainingParticipant/);
  assert.match(schema, /model TeacherTrainingCourseSession/);
  assert.match(schema, /model TeacherTrainingAttendance/);
  assert.match(schema, /model TeacherTrainingTask/);
  assert.match(schema, /model TeacherTrainingSubmission/);
  assert.match(schema, /training_teacher/);
  assert.match(schema, /@@unique\(\[participantId,\s*sessionDate,\s*sessionLabel\]\)/);
  assert.match(schema, /markedById/);
  assert.match(schema, /TeacherTrainingCourseSessionCreator/);
});

test("workspace exposes teacher training as a switched admin platform", () => {
  const contextSource = read("src/components/workspace-context.tsx");
  const shellSource = read("src/components/workspace-shell.tsx");
  const dashboardSource = read("src/components/workspace-dashboard.tsx");
  const workspacePageSource = read("src/app/workspace/page.tsx");

  assert.match(contextSource, /\|\s*"teacherTraining"/);
  assert.match(contextSource, /label:\s*"省培"/);
  assert.match(contextSource, /school_admin:[\s\S]*"teacherTraining"/);
  assert.match(contextSource, /admin:[\s\S]*"teacherTraining"/);
  assert.doesNotMatch(contextSource, /\n\s+teacher:[\s\S]*visibleTabs:[^\n]*"teacherTraining"/);
  assert.match(contextSource, /\n\s+training_teacher:[\s\S]*visibleTabs:[^\n]*"teacherTraining"/);
  assert.match(contextSource, /canManageTeacherTraining/);
  assert.match(contextSource, /isTeacherTrainingPlatform/);
  assert.match(contextSource, /item\.key !== "teacherTraining"/);
  assert.match(shellSource, /平台切换/);
  assert.match(shellSource, /省培管理/);
  assert.match(shellSource, /topbar-platform-switch/);
  assert.match(shellSource, /href="\/workspace\?tab=teacherTraining"/);
  assert.match(dashboardSource, /loadTeacherTrainingTab/);
  assert.match(dashboardSource, /safeActiveTab === "teacherTraining"/);
  assert.match(workspacePageSource, /"teacherTraining"/);
});

test("teacher training APIs support admin-managed courses, check-in, tasks, submissions, profile, and export", () => {
  const mainRoute = read("src/app/api/teacher-training/route.ts");
  const courseRoute = read("src/app/api/teacher-training/course-sessions/route.ts");
  const attendanceRoute = read("src/app/api/teacher-training/attendance/route.ts");
  const taskRoute = read("src/app/api/teacher-training/tasks/route.ts");
  const submissionRoute = read("src/app/api/teacher-training/submissions/route.ts");
  const profileRoute = read("src/app/api/teacher-training/profile/route.ts");
  const exportRoute = read("src/app/api/teacher-training/export/route.ts");

  for (const source of [courseRoute, attendanceRoute, taskRoute, exportRoute]) {
    assert.match(source, /assertRole\(user\.role,\s*\["admin",\s*"school_admin"\]\)/);
  }

  assert.match(mainRoute, /assertRole\(user\.role,\s*\["admin",\s*"school_admin",\s*"training_teacher"\]\)/);
  assert.match(submissionRoute, /assertRole\(user\.role,\s*\["admin",\s*"school_admin",\s*"training_teacher"\]\)/);
  assert.match(profileRoute, /assertRole\(user\.role,\s*\["training_teacher"\]\)/);
  assert.match(mainRoute, /accountUserId:\s*user\.id/);
  assert.match(submissionRoute, /accountUserId:\s*user\.id/);
  assert.match(profileRoute, /accountUserId:\s*user\.id/);
  assert.match(read("src/app/api/teacher-training/participants/route.ts"), /role:\s*"training_teacher"/);
  assert.match(mainRoute, /courseSessions/);
  assert.match(courseRoute, /createdById:\s*user\.id/);
  assert.match(attendanceRoute, /upsert/);
  assert.match(attendanceRoute, /markedById:\s*user\.id/);
  assert.match(taskRoute, /createdById:\s*user\.id/);
  assert.match(submissionRoute, /submittedById:\s*user\.id/);
  assert.match(exportRoute, /text\/csv/);
  assert.match(exportRoute, /buildTeacherTrainingCsv/);
});

test("teacher training tab uses staff-side manual check-in controls", () => {
  const tabSource = read("src/components/tabs/teacher-training-tab.tsx");

  assert.match(tabSource, /工作人员后台勾选/);
  assert.match(tabSource, /课程安排/);
  assert.match(tabSource, /createTeacherTrainingCourseSession/);
  assert.match(tabSource, /参训教师中心/);
  assert.match(tabSource, /系统管理员、校级管理员/);
  assert.match(tabSource, /保存个人信息/);
  assert.match(tabSource, /updateTeacherTrainingProfile/);
  assert.match(tabSource, /markTeacherTrainingAttendance/);
  assert.match(tabSource, /已报到/);
  assert.match(tabSource, /请假/);
  assert.match(tabSource, /缺勤/);
  assert.match(tabSource, /导出签到/);
  assert.doesNotMatch(tabSource, /二维码|扫码|定位|GPS|geolocation/);
});
