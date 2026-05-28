import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

test("teacher provincial training has isolated durable models", () => {
  const schema = read("prisma/schema.prisma");

  assert.match(schema, /model TeacherTrainingCohort/);
  assert.match(schema, /model TeacherTrainingCohortManager/);
  assert.match(schema, /model TeacherTrainingParticipant/);
  assert.match(schema, /model TeacherTrainingCourseSession/);
  assert.match(schema, /model TeacherTrainingCheckInTask/);
  assert.match(schema, /model TeacherTrainingCheckInRecord/);
  assert.match(schema, /model TeacherTrainingLeaveFlow/);
  assert.match(schema, /model TeacherTrainingLeaveRequest/);
  assert.match(schema, /model TeacherTrainingLeaveApproval/);
  assert.match(schema, /model TeacherTrainingAttendance/);
  assert.match(schema, /model TeacherTrainingTask/);
  assert.match(schema, /model TeacherTrainingSubmission/);
  assert.match(schema, /training_teacher/);
  assert.match(schema, /@@unique\(\[participantId,\s*sessionDate,\s*sessionLabel\]\)/);
  assert.match(schema, /markedById/);
  assert.match(schema, /TeacherTrainingCourseSessionCreator/);
  assert.match(schema, /TeacherTrainingCohortManagerUser/);
  assert.match(schema, /@@unique\(\[cohortId,\s*userId\]\)/);
  assert.match(schema, /@@unique\(\[checkInTaskId,\s*participantId\]\)/);
  assert.match(schema, /extraInfo\s+String\?/);
  assert.match(schema, /approvalSteps\s+String/);
  assert.match(schema, /currentStepIndex\s+Int/);
  assert.match(schema, /@@unique\(\[leaveRequestId,\s*stepKey,\s*approverId\]\)/);
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
  assert.match(contextSource, /hasTeacherTrainingAccess/);
  assert.match(contextSource, /hasTeacherTrainingManagerAccess/);
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
  const authMeRoute = read("src/app/api/auth/me/route.ts");
  const loginRoute = read("src/app/api/auth/login/route.ts");
  const managerRoute = read("src/app/api/teacher-training/cohort-managers/route.ts");
  const courseRoute = read("src/app/api/teacher-training/course-sessions/route.ts");
  const checkInRoute = read("src/app/api/teacher-training/check-ins/route.ts");
  const checkInSignRoute = read("src/app/api/teacher-training/check-ins/sign/route.ts");
  const leaveFlowRoute = read("src/app/api/teacher-training/leave-flow/route.ts");
  const leaveRequestRoute = read("src/app/api/teacher-training/leave-requests/route.ts");
  const leaveReviewRoute = read("src/app/api/teacher-training/leave-requests/[leaveRequestId]/review/route.ts");
  const leavePdfRoute = read("src/app/api/teacher-training/leave-requests/[leaveRequestId]/pdf/route.ts");
  const participantAccountRoute = read("src/app/api/teacher-training/participants/[participantId]/account/route.ts");
  const attendanceRoute = read("src/app/api/teacher-training/attendance/route.ts");
  const taskRoute = read("src/app/api/teacher-training/tasks/route.ts");
  const submissionRoute = read("src/app/api/teacher-training/submissions/route.ts");
  const profileRoute = read("src/app/api/teacher-training/profile/route.ts");
  const exportRoute = read("src/app/api/teacher-training/export/route.ts");

  for (const source of [courseRoute, checkInRoute, attendanceRoute, taskRoute, exportRoute]) {
    assert.match(source, /hasTeacherTrainingCohortManageAccess/);
  }
  assert.match(participantAccountRoute, /assertRole\(user\.role,\s*\["admin",\s*"school_admin"\]\)/);
  assert.match(leaveFlowRoute, /assertRole\(user\.role,\s*\["admin"\]\)/);

  assert.match(authMeRoute, /serializeUserWithTeacherTrainingAccess/);
  assert.match(loginRoute, /serializeUserWithTeacherTrainingAccess/);
  assert.match(mainRoute, /getTeacherTrainingAccessFlags/);
  assert.match(mainRoute, /teacherTrainingCohortManager\.findMany/);
  assert.match(mainRoute, /managers/);
  assert.match(managerRoute, /assertRole\(user\.role,\s*\["admin",\s*"school_admin"\]\)/);
  assert.match(managerRoute, /teacherTrainingCohortManager\.upsert/);
  assert.match(managerRoute, /teacherTrainingCohortManager\.deleteMany/);
  assert.match(managerRoute, /role:\s*\{\s*not:\s*"expert"\s*\}/);
  assert.doesNotMatch(checkInSignRoute, /assertRole\(user\.role,\s*\["training_teacher"\]\)/);
  assert.doesNotMatch(leaveRequestRoute, /assertRole\(user\.role,\s*\["training_teacher"\]\)/);
  assert.match(leaveReviewRoute, /assertRole\(user\.role,\s*\["admin",\s*"school_admin"\]\)/);
  assert.doesNotMatch(leavePdfRoute, /assertRole\(user\.role,\s*\["admin",\s*"school_admin",\s*"training_teacher"\]\)/);
  assert.doesNotMatch(submissionRoute, /assertRole\(user\.role,\s*\["admin",\s*"school_admin",\s*"training_teacher"\]\)/);
  assert.doesNotMatch(profileRoute, /assertRole\(user\.role,\s*\["training_teacher"\]\)/);
  assert.match(mainRoute, /accountUserId:\s*user\.id/);
  assert.match(checkInSignRoute, /accountUserId:\s*user\.id/);
  assert.match(submissionRoute, /accountUserId:\s*user\.id/);
  assert.match(profileRoute, /accountUserId:\s*user\.id/);
  assert.match(read("src/app/api/teacher-training/participants/route.ts"), /existingAccount/);
  assert.match(read("src/app/api/teacher-training/participants/route.ts"), /accountUserId\s*=\s*existingAccount\.id/);
  assert.match(read("src/app/api/teacher-training/participants/route.ts"), /role === "expert"/);
  assert.match(read("src/app/api/teacher-training/participants/route.ts"), /role:\s*"training_teacher"/);
  assert.match(read("src/app/api/teacher-training/participants/route.ts"), /extraInfo/);
  assert.match(participantAccountRoute, /buildTeacherTrainingAccountMessage/);
  assert.match(participantAccountRoute, /linkedExistingAccount/);
  assert.match(participantAccountRoute, /role === "expert"/);
  assert.match(participantAccountRoute, /role:\s*"training_teacher"/);
  assert.match(mainRoute, /courseSessions/);
  assert.match(mainRoute, /checkInTasks/);
  assert.match(mainRoute, /leaveFlow/);
  assert.match(mainRoute, /leaveRequests/);
  assert.match(mainRoute, /approverOptions/);
  assert.match(courseRoute, /createdById:\s*user\.id/);
  assert.match(checkInRoute, /createdById:\s*user\.id/);
  assert.match(checkInSignRoute, /calculateDistanceMeters/);
  assert.match(checkInSignRoute, /upsert/);
  assert.match(leaveFlowRoute, /approvalSteps/);
  assert.match(leaveFlowRoute, /requiredCount/);
  assert.match(leaveRequestRoute, /accountUserId:\s*user\.id/);
  assert.match(leaveRequestRoute, /currentStepIndex:\s*0/);
  assert.match(leaveReviewRoute, /requiredCount/);
  assert.match(leaveReviewRoute, /currentStepIndex/);
  assert.match(leaveReviewRoute, /teacherTrainingLeaveApproval\.upsert/);
  assert.match(leaveReviewRoute, /teacherTrainingAttendance\.upsert/);
  assert.match(leaveReviewRoute, /status:\s*"leave"/);
  assert.match(leavePdfRoute, /buildTeacherTrainingLeaveRequestPdf/);
  assert.match(leavePdfRoute, /application\/pdf/);
  assert.match(leavePdfRoute, /accountUserId === user\.id/);
  assert.match(leavePdfRoute, /hasTeacherTrainingCohortManageAccess/);
  assert.match(attendanceRoute, /upsert/);
  assert.match(attendanceRoute, /markedById:\s*user\.id/);
  assert.match(taskRoute, /createdById:\s*user\.id/);
  assert.match(submissionRoute, /submittedById:\s*user\.id/);
  assert.match(submissionRoute, /hasTeacherTrainingCohortManageAccess/);
  assert.match(exportRoute, /text\/csv/);
  assert.match(exportRoute, /buildTeacherTrainingCsv/);
  assert.match(exportRoute, /checkIns/);
});

test("teacher training tab uses staff-side manual check-in controls", () => {
  const tabSource = read("src/components/tabs/teacher-training-tab.tsx");

  assert.match(tabSource, /工作人员后台勾选/);
  assert.match(tabSource, /课程安排/);
  assert.match(tabSource, /createTeacherTrainingCourseSession/);
  assert.match(tabSource, /参训教师中心/);
  assert.match(tabSource, /班主任/);
  assert.match(tabSource, /assignTeacherTrainingCohortManager/);
  assert.match(tabSource, /removeTeacherTrainingCohortManager/);
  assert.match(tabSource, /系统管理员、校级管理员/);
  assert.match(tabSource, /已有平台账号/);
  assert.match(tabSource, /预录扩展信息/);
  assert.match(tabSource, /一键复制账号消息/);
  assert.match(tabSource, /generateTeacherTrainingAccountMessage/);
  assert.match(tabSource, /请假流程设置/);
  assert.match(tabSource, /审批步骤/);
  assert.match(tabSource, /每步通过人数/);
  assert.match(tabSource, /临时请假/);
  assert.match(tabSource, /提交请假/);
  assert.match(tabSource, /请假审批/);
  assert.match(tabSource, /updateTeacherTrainingLeaveFlow/);
  assert.match(tabSource, /submitTeacherTrainingLeaveRequest/);
  assert.match(tabSource, /reviewTeacherTrainingLeaveRequest/);
  assert.match(tabSource, /导出PDF请假单/);
  assert.match(tabSource, /保存个人信息/);
  assert.match(tabSource, /updateTeacherTrainingProfile/);
  assert.match(tabSource, /markTeacherTrainingAttendance/);
  assert.match(tabSource, /已报到/);
  assert.match(tabSource, /请假/);
  assert.match(tabSource, /缺勤/);
  assert.match(tabSource, /导出签到/);
  assert.doesNotMatch(tabSource, /二维码|扫码/);
});

test("teacher training tab supports location-based course check-in tasks", () => {
  const tabSource = read("src/components/tabs/teacher-training-tab.tsx");
  const contextSource = read("src/components/workspace-context.tsx");

  assert.match(tabSource, /发布签到任务/);
  assert.match(tabSource, /课程定位签到/);
  assert.match(tabSource, /定位签到/);
  assert.match(tabSource, /navigator\.geolocation/);
  assert.match(tabSource, /createTeacherTrainingCheckInTask/);
  assert.match(tabSource, /signTeacherTrainingCheckIn/);
  assert.match(tabSource, /导出课程签到/);
  assert.match(contextSource, /TeacherTrainingCheckInTaskDraft/);
  assert.match(contextSource, /TeacherTrainingCheckInSignDraft/);
});
