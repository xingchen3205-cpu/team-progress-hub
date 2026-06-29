import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  getAllowedTeacherTrainingCheckInDistanceMeters,
  getTeacherTrainingEffectiveRoleLabel,
  validateTeacherTrainingLeaveRange,
} from "../src/lib/teacher-training";
import { parseTeacherTrainingParticipantImportText } from "../src/lib/teacher-training-participant-import";

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
  assert.match(schema, /startTime\s+String\?/);
  assert.match(schema, /endTime\s+String\?/);
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
  assert.match(contextSource, /if \(item\.key === "teacherTraining"\) \{\s*return false;\s*\}/);
  assert.match(shellSource, /平台切换/);
  assert.match(shellSource, /省培管理/);
  assert.match(shellSource, /topbar-platform-switch/);
  assert.match(shellSource, /hasTeacherTrainingAccess && currentRole !== "training_teacher"/);
  assert.match(shellSource, /openPlatformSwitchDialog\("teacherTraining"\)/);
  assert.match(shellSource, /router\.push\(targetHref\)/);
  assert.match(dashboardSource, /loadTeacherTrainingTab/);
  assert.match(dashboardSource, /safeActiveTab === "teacherTraining"/);
  assert.match(workspacePageSource, /"teacherTraining"/);
});

test("teacher training management layout keeps cards aligned without oversized empty canvas", () => {
  const shellSource = read("src/components/workspace-shell.tsx");
  const tabSource = read("src/components/tabs/teacher-training-tab.tsx");

  assert.match(shellSource, /const workspaceMainClassName = isTeacherTrainingPlatform/);
  assert.match(shellSource, /workspace-depth-bg workspace-shell-fade-in overflow-x-hidden px-4 pt-4 pb-8/);
  assert.match(shellSource, /workspace-depth-bg workspace-shell-fade-in min-h-screen overflow-x-hidden p-4 pb-14/);
  assert.match(shellSource, /<main className=\{workspaceMainClassName\}>/);
  assert.match(tabSource, /teacherTrainingScrollableListClassName/);
  assert.match(tabSource, /max-h-\[min\(68vh,760px\)\] overflow-y-auto/);
  assert.match(tabSource, /teacherTrainingManagementGridClassName[\s\S]*items-start xl:grid-cols-\[420px_minmax\(0,1fr\)\]/);
  assert.match(tabSource, /grid items-start gap-4 xl:grid-cols-\[minmax\(0,1fr\)_minmax\(420px,460px\)\]/);
  assert.match(tabSource, /grid items-start gap-4 xl:grid-cols-2/);
});

test("teacher training APIs support admin-managed courses, check-in, tasks, submissions, profile, and export", () => {
  const mainRoute = read("src/app/api/teacher-training/route.ts");
  const authMeRoute = read("src/app/api/auth/me/route.ts");
  const loginRoute = read("src/app/api/auth/login/route.ts");
  const accessSource = read("src/lib/teacher-training-access.ts");
  const managerRoute = read("src/app/api/teacher-training/cohort-managers/route.ts");
  const courseRoute = read("src/app/api/teacher-training/course-sessions/route.ts");
  const checkInRoute = read("src/app/api/teacher-training/check-ins/route.ts");
  const checkInSignRoute = read("src/app/api/teacher-training/check-ins/sign/route.ts");
  const checkInManualRoute = read("src/app/api/teacher-training/check-ins/manual/route.ts");
  const leaveFlowRoute = read("src/app/api/teacher-training/leave-flow/route.ts");
  const leaveRequestRoute = read("src/app/api/teacher-training/leave-requests/route.ts");
  const leaveReviewRoute = read("src/app/api/teacher-training/leave-requests/[leaveRequestId]/review/route.ts");
  const leavePdfRoute = read("src/app/api/teacher-training/leave-requests/[leaveRequestId]/pdf/route.ts");
  const participantsRoute = read("src/app/api/teacher-training/participants/route.ts");
  const participantAccountRoute = read("src/app/api/teacher-training/participants/[participantId]/account/route.ts");
  const attendanceRoute = read("src/app/api/teacher-training/attendance/route.ts");
  const taskRoute = read("src/app/api/teacher-training/tasks/route.ts");
  const submissionRoute = read("src/app/api/teacher-training/submissions/route.ts");
  const profileRoute = read("src/app/api/teacher-training/profile/route.ts");
  const exportRoute = read("src/app/api/teacher-training/export/route.ts");

  for (const source of [participantsRoute, participantAccountRoute, courseRoute, checkInRoute, attendanceRoute, taskRoute, exportRoute]) {
    assert.match(source, /hasTeacherTrainingCohortManageAccess/);
  }
  assert.doesNotMatch(participantAccountRoute, /assertRole\(user\.role,\s*\["admin",\s*"school_admin"\]\)/);
  assert.match(leaveFlowRoute, /assertRole\(user\.role,\s*\["admin"\]\)/);

  assert.match(authMeRoute, /serializeUserWithTeacherTrainingAccess/);
  assert.match(loginRoute, /serializeUserWithTeacherTrainingAccess/);
  assert.match(mainRoute, /getTeacherTrainingAccessFlags/);
  assert.match(mainRoute, /teacherTrainingCohortManager\.findMany/);
  assert.match(mainRoute, /managers/);
  assert.match(accessSource, /isTeacherTrainingSystemAdmin/);
  assert.doesNotMatch(accessSource, /hasGlobalAdminPrivileges/);
  assert.match(accessSource, /user\.role === "admin"/);
  assert.match(managerRoute, /assertRole\(user\.role,\s*\["admin"\]\)/);
  assert.doesNotMatch(managerRoute, /assertRole\(user\.role,\s*\["admin",\s*"school_admin"\]\)/);
  assert.match(managerRoute, /teacherTrainingCohortManager\.upsert/);
  assert.match(managerRoute, /teacherTrainingCohortManager\.deleteMany/);
  assert.match(managerRoute, /role:\s*\{\s*not:\s*"expert"\s*\}/);
  assert.doesNotMatch(checkInSignRoute, /assertRole\(user\.role,\s*\["training_teacher"\]\)/);
  assert.doesNotMatch(leaveRequestRoute, /assertRole\(user\.role,\s*\["training_teacher"\]\)/);
  assert.doesNotMatch(leaveReviewRoute, /assertRole\(user\.role,\s*\["admin",\s*"school_admin"\]\)/);
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
  assert.match(checkInRoute, /请同时填写纬度和经度/);
  assert.match(checkInRoute, /经纬度范围不正确/);
  assert.match(checkInSignRoute, /calculateDistanceMeters/);
  assert.match(checkInSignRoute, /getAllowedTeacherTrainingCheckInDistanceMeters/);
  assert.match(checkInSignRoute, /getTeacherTrainingCheckInWindowState/);
  assert.match(checkInSignRoute, /teacherTrainingCheckInWindowMessages/);
  assert.match(checkInSignRoute, /定位坐标不正确/);
  assert.match(checkInSignRoute, /upsert/);
  assert.match(checkInManualRoute, /hasTeacherTrainingCohortManageAccess/);
  assert.match(checkInManualRoute, /人工补签原因/);
  assert.match(checkInManualRoute, /status:\s*"manual"/);
  assert.match(checkInManualRoute, /upsert/);
  assert.match(leaveFlowRoute, /approvalSteps/);
  assert.match(leaveFlowRoute, /requiredCount/);
  assert.match(leaveRequestRoute, /accountUserId:\s*user\.id/);
  assert.match(leaveRequestRoute, /currentStepIndex:\s*0/);
  assert.match(leaveReviewRoute, /requiredCount/);
  assert.match(leaveReviewRoute, /currentStepIndex/);
  assert.match(leaveReviewRoute, /teacherTrainingLeaveApproval\.upsert/);
  assert.match(leaveReviewRoute, /teacherTrainingAttendance\.upsert/);
  assert.match(leaveReviewRoute, /status:\s*"leave"/);
  assert.match(leaveRequestRoute, /createNotifications/);
  assert.match(leaveRequestRoute, /teacher_training_leave_review/);
  assert.match(leaveRequestRoute, /approvalSteps\[0\]\?\.approverIds/);
  assert.match(leaveReviewRoute, /createNotifications/);
  assert.match(leaveReviewRoute, /teacher_training_leave_review/);
  assert.match(leaveReviewRoute, /teacher_training_leave_result/);
  assert.match(leaveRequestRoute, /includeAdmins:\s*true/);
  assert.match(leaveReviewRoute, /includeAdmins:\s*true/);
  assert.match(leaveReviewRoute, /submittedById/);
  assert.match(leavePdfRoute, /buildTeacherTrainingLeaveRequestPdf/);
  assert.match(leavePdfRoute, /application\/pdf/);
  assert.match(leavePdfRoute, /accountUserId === user\.id/);
  assert.match(leavePdfRoute, /hasTeacherTrainingCohortManageAccess/);
  assert.match(attendanceRoute, /upsert/);
  assert.match(attendanceRoute, /markedById:\s*user\.id/);
  assert.match(taskRoute, /createdById:\s*user\.id/);
  assert.match(submissionRoute, /submittedById:\s*user\.id/);
  assert.match(submissionRoute, /hasTeacherTrainingCohortManageAccess/);
  assert.match(submissionRoute, /requireAttachment/);
  assert.match(submissionRoute, /该任务要求上传 Word\/PDF 附件/);
  assert.match(submissionRoute, /getTeacherTrainingSubmissionAttachmentObjectKeyPrefix/);
  assert.match(submissionRoute, /附件路径与当前任务不匹配/);
  assert.match(exportRoute, /text\/csv/);
  assert.match(exportRoute, /buildTeacherTrainingCsv/);
  assert.match(exportRoute, /checkIns/);
});

test("teacher training managed records can be edited or deleted with clear confirmation", () => {
  const mainRoute = read("src/app/api/teacher-training/route.ts");
  const courseRoute = read("src/app/api/teacher-training/course-sessions/route.ts");
  const checkInRoute = read("src/app/api/teacher-training/check-ins/route.ts");
  const taskRoute = read("src/app/api/teacher-training/tasks/route.ts");
  const contextSource = read("src/components/workspace-context.tsx");
  const tabSource = read("src/components/tabs/teacher-training-tab.tsx");

  for (const source of [mainRoute, courseRoute, checkInRoute, taskRoute]) {
    assert.match(source, /export async function PATCH/);
    assert.match(source, /export async function DELETE/);
  }

  assert.match(contextSource, /deleteTeacherTrainingCohort/);
  assert.match(contextSource, /deleteTeacherTrainingCourseSession/);
  assert.match(contextSource, /deleteTeacherTrainingCheckInTask/);
  assert.match(contextSource, /deleteTeacherTrainingTask/);
  assert.match(tabSource, /确认删除省培班次/);
  assert.match(tabSource, /确认删除课程/);
  assert.match(tabSource, /确认删除签到任务/);
  assert.match(tabSource, /确认删除省培任务/);
  assert.match(tabSource, /请再次确认永久删除/);
  assert.match(tabSource, /Pencil/);
  assert.match(tabSource, /Trash2/);
  assert.match(tabSource, /正在修改班次/);
});

test("teacher training search, import, profile title/email, leave approvers, and report archive exports are wired", () => {
  const mainRoute = read("src/app/api/teacher-training/route.ts");
  const participantsRoute = read("src/app/api/teacher-training/participants/route.ts");
  const courseRoute = read("src/app/api/teacher-training/course-sessions/route.ts");
  const profileRoute = read("src/app/api/teacher-training/profile/route.ts");
  const leaveFlowRoute = read("src/app/api/teacher-training/leave-flow/route.ts");
  const leaveRequestRoute = read("src/app/api/teacher-training/leave-requests/route.ts");
  const leaveReviewRoute = read("src/app/api/teacher-training/leave-requests/[leaveRequestId]/review/route.ts");
  const leavePdfRoute = read("src/app/api/teacher-training/leave-requests/[leaveRequestId]/pdf/route.ts");
  const leavePdfSource = read("src/lib/teacher-training-leave-pdf.ts");
  const exportRoute = read("src/app/api/teacher-training/export/route.ts");
  const libSource = read("src/lib/teacher-training.ts");
  const tabSource = read("src/components/tabs/teacher-training-tab.tsx");

  assert.match(tabSource, /participantSearch/);
  assert.match(tabSource, /attendanceSearch/);
  assert.match(tabSource, /checkInSearch/);
  assert.match(tabSource, /leaveSearch/);
  assert.match(tabSource, /submissionSearch/);
  assert.match(tabSource, /搜索参训教师/);
  assert.match(tabSource, /搜索报到登记/);
  assert.match(tabSource, /搜索课程签到教师/);
  assert.match(tabSource, /搜索请假教师/);
  assert.match(tabSource, /搜索汇报教师/);
  assert.match(tabSource, /filteredCheckInTasks/);
  assert.match(tabSource, /managerVisibleLeaveRequests/);
  assert.match(tabSource, /filteredSubmissionTasks/);
  assert.match(tabSource, /participantImportText/);
  assert.match(tabSource, /courseImportText/);
  assert.match(tabSource, /participantImportPreview/);
  assert.match(tabSource, /courseImportPreview/);
  assert.match(tabSource, /participantImportFieldSummary/);
  assert.match(tabSource, /courseImportFieldSummary/);
  assert.match(tabSource, /字段识别结果/);
  assert.match(tabSource, /姓名列/);
  assert.match(tabSource, /单位列/);
  assert.match(tabSource, /手机号列/);
  assert.match(tabSource, /课程名称列/);
  assert.match(tabSource, /课程日期列/);
  assert.match(tabSource, /导入预览：将新增 \{participantImportPreview\.readyCount\} 位参训教师/);
  assert.match(tabSource, /导入预览：将新增 \{courseImportPreview\.readyCount\} 条课程/);
  assert.match(tabSource, /请先处理导入预览中的问题/);
  assert.match(tabSource, /一键导入参训教师/);
  assert.match(tabSource, /一键导入课程/);
  assert.match(tabSource, /canManage && showTeacherTrainingSection\("participants"\)/);
  assert.doesNotMatch(tabSource, /canManageGlobal && showTeacherTrainingSection\("participants"\)/);
  assert.match(tabSource, /个人职务/);
  assert.match(tabSource, /个人邮箱/);
  assert.match(tabSource, /updateProfileDraftField\("title"/);
  assert.match(tabSource, /updateProfileDraftField\("email"/);
  assert.match(tabSource, /approverLabelById/);
  assert.match(tabSource, /已审批：/);
  assert.doesNotMatch(tabSource, /\?\?\s*"审批人"/);

  assert.match(mainRoute, /teacherTrainingManagedCohorts/);
  assert.match(leaveFlowRoute, /teacherTrainingManagedCohorts/);
  assert.match(leaveFlowRoute, /审批人必须是已启用的管理员、当前班次省培负责人或班主任/);
  assert.match(leaveReviewRoute, /currentStep\.approverIds\.includes\(user\.id\)/);
  assert.match(leaveRequestRoute, /startTime/);
  assert.match(leaveRequestRoute, /endTime/);
  assert.match(leavePdfSource, /电子签/);
  assert.match(leavePdfSource, /自动生成电子签/);
  assert.match(leavePdfRoute, /parseTeacherTrainingParticipantExtraInfo/);
  assert.match(leavePdfRoute, /extraInfo/);
  assert.match(leavePdfRoute, /managers/);
  assert.match(leavePdfRoute, /role/);
  assert.match(leavePdfRoute, /leaveSequence/);
  assert.match(leavePdfSource, /buildLeaveDocumentNumber/);
  assert.match(leavePdfSource, /请〔/);
  assert.match(leavePdfSource, /leaveSequence/);
  assert.match(leavePdfSource, /formatLeaveDuration/);
  assert.match(leavePdfSource, /申请人电子签/);
  assert.match(leavePdfSource, /approverTitle/);
  assert.match(leavePdfSource, /drawApprovalBlock/);
  assert.match(leavePdfSource, /fitTextToWidth/);
  assert.match(leavePdfSource, /options\.maxLines === 1/);
  assert.doesNotMatch(leavePdfSource, /truncateText\(participantName/);
  assert.doesNotMatch(leavePdfSource, /approverName:/);
  assert.doesNotMatch(leavePdfSource, /编号：系统自动生成/);

  assert.match(participantsRoute, /participants\?:/);
  assert.match(participantsRoute, /mergeTeacherTrainingParticipantExtraInfo/);
  assert.match(courseRoute, /courses\?:/);
  assert.match(profileRoute, /title\?:/);
  assert.match(profileRoute, /email\?:/);
  assert.match(libSource, /parseTeacherTrainingParticipantExtraInfo/);
  assert.match(libSource, /mergeTeacherTrainingParticipantExtraInfo/);
  assert.match(libSource, /buildTeacherTrainingSubmissionWordDocument/);
  assert.match(exportRoute, /application\/zip/);
  assert.match(exportRoute, /createZipArchive/);
  assert.match(exportRoute, /buildTeacherTrainingSubmissionWordDocument/);
  assert.match(tabSource, /recentExportRecords/);
  assert.match(tabSource, /本次浏览导出记录/);
  assert.match(tabSource, /formatClientDateTime/);
});

test("teacher training shows province-specific account titles instead of competition roles", () => {
  const shellSource = read("src/components/workspace-shell.tsx");
  const contextSource = read("src/components/workspace-context.tsx");
  const tabSource = read("src/components/tabs/teacher-training-tab.tsx");
  const schoolAdminPermissionsSource = contextSource.slice(
    contextSource.indexOf("  school_admin:"),
    contextSource.indexOf("  training_teacher:"),
  );

  assert.equal(
    getTeacherTrainingEffectiveRoleLabel({
      user: { id: "user-1", role: "member", roleLabel: "团队成员", hasTeacherTrainingAccess: true },
      cohorts: [
        {
          id: "cohort-1",
          managers: [],
          participants: [{ accountUserId: "user-1", title: "讲师" }],
        },
      ],
    }),
    "讲师",
  );
  assert.equal(
    getTeacherTrainingEffectiveRoleLabel({
      user: { id: "manager-1", role: "teacher", roleLabel: "指导教师", hasTeacherTrainingManagerAccess: true },
      cohorts: [
        {
          id: "cohort-1",
          managers: [{ userId: "manager-1", title: "省培负责人" }],
          participants: [],
        },
      ],
    }),
    "省培负责人",
  );
  assert.equal(
    getTeacherTrainingEffectiveRoleLabel({
      user: { id: "participant-1", role: "teacher", roleLabel: "指导教师", hasTeacherTrainingAccess: true },
      cohorts: [
        {
          participants: [{ accountUserId: "participant-1", title: "省培联络员" }],
        },
      ],
    }),
    "省培联络员",
  );
  assert.equal(
    getTeacherTrainingEffectiveRoleLabel({
      user: { id: "multi-1", role: "teacher", roleLabel: "指导教师", hasTeacherTrainingAccess: true },
      activeCohortId: "cohort-b",
      cohorts: [
        {
          id: "cohort-a",
          participants: [{ accountUserId: "multi-1", title: "第一班职务" }],
        },
        {
          id: "cohort-b",
          participants: [{ accountUserId: "multi-1", title: "当前班次职务" }],
        },
      ],
    }),
    "当前班次职务",
  );
  assert.equal(
    getTeacherTrainingEffectiveRoleLabel({
      user: { id: "school-admin-1", role: "school_admin", roleLabel: "校级管理员", hasTeacherTrainingAccess: true },
      cohorts: [
        {
          participants: [{ accountUserId: "school-admin-1", title: "省培学员组长" }],
        },
      ],
    }),
    "省培学员组长",
  );
  assert.equal(
    getTeacherTrainingEffectiveRoleLabel({
      user: { id: "admin-1", role: "school_admin", roleLabel: "校级管理员", hasTeacherTrainingAccess: true },
      cohorts: [],
    }),
    "省培管理员",
  );
  assert.match(shellSource, /sidebarRoleLabel/);
  assert.match(shellSource, /getTeacherTrainingEffectiveRoleLabel/);
  assert.match(shellSource, /activeCohortId:\s*activeTeacherTrainingCohortId/);
  assert.match(contextSource, /activeTeacherTrainingCohortId/);
  assert.match(tabSource, /setActiveTeacherTrainingCohortId/);
  assert.match(contextSource, /hasTeacherTrainingAccess = Boolean\(currentUser\?\.hasTeacherTrainingAccess\)/);
  assert.match(contextSource, /hasTeacherTrainingManagerAccess =\s*Boolean\(currentUser\?\.hasTeacherTrainingManagerAccess\)/);
  assert.doesNotMatch(contextSource, /hasTeacherTrainingSystemAdminRole/);
  assert.doesNotMatch(contextSource, /const hasTeacherTrainingAccess = hasGlobalAdminRole \|\|/);
  assert.doesNotMatch(contextSource, /const hasTeacherTrainingManagerAccess = hasGlobalAdminRole \|\|/);
  assert.doesNotMatch(schoolAdminPermissionsSource, /"teacherTraining"/);
});

test("teacher training managers can edit and delete provincial teacher accounts inside provincial training", () => {
  const participantAccountRoute = read("src/app/api/teacher-training/participants/[participantId]/account/route.ts");
  const participantsRoute = read("src/app/api/teacher-training/participants/route.ts");
  const contextSource = read("src/components/workspace-context.tsx");
  const tabSource = read("src/components/tabs/teacher-training-tab.tsx");
  const mainRouteSource = read("src/app/api/teacher-training/route.ts");
  const teacherTrainingSource = read("src/lib/teacher-training.ts");

  assert.match(participantsRoute, /export async function DELETE/);
  assert.match(participantsRoute, /hasTeacherTrainingCohortManageAccess/);
  assert.match(participantsRoute, /teacherTrainingParticipant\.delete/);
  assert.match(participantsRoute, /accountUserId/);
  assert.match(participantAccountRoute, /export async function PATCH/);
  assert.match(participantAccountRoute, /export async function DELETE/);
  assert.match(participantAccountRoute, /原平台账号只解除绑定/);
  assert.match(participantAccountRoute, /teacherTrainingParticipant\.updateMany/);
  assert.match(participantAccountRoute, /user\.delete/);
  assert.match(mainRouteSource, /role:\s*true/);
  assert.match(teacherTrainingSource, /accountRole/);

  assert.match(contextSource, /updateTeacherTrainingParticipantAccount/);
  assert.match(contextSource, /deleteTeacherTrainingParticipantAccount/);
  assert.match(contextSource, /deleteTeacherTrainingParticipant/);
  assert.match(tabSource, /participantAccountStatusSummary/);
  assert.match(tabSource, /未绑定账号/);
  assert.match(tabSource, /省培专用账号/);
  assert.match(tabSource, /原平台账号/);
  assert.match(tabSource, /只解绑账号，不删除档案/);
  assert.match(tabSource, /筛选未绑定账号/);
  assert.match(tabSource, /重置账号密码/);
  assert.match(tabSource, /解绑省培账号/);
  assert.match(tabSource, /删除参训教师/);
  assert.match(tabSource, /参训教师档案/);
  assert.match(tabSource, /省培账号处理/);
  assert.doesNotMatch(tabSource, /tt-action-card grid gap-3 p-4 lg:grid-cols-\[minmax\(0,1fr\)_auto\]/);
  assert.match(tabSource, /确认解绑省培账号/);
});

test("teacher training participant import accepts uploaded Excel and maps headers", () => {
  const tabSource = read("src/components/tabs/teacher-training-tab.tsx");
  const importRoute = read("src/app/api/teacher-training/import/route.ts");
  const importSource = read("src/lib/teacher-training-participant-import.ts");

  assert.match(tabSource, /parseTeacherTrainingParticipantImportText/);
  assert.match(tabSource, /buildParticipantImportPreview/);
  assert.match(tabSource, /handleParticipantImportFile/);
  assert.match(tabSource, /上传名单文件/);
  assert.match(tabSource, /accept="\.xlsx,\.csv,\.tsv,\.txt/);
  assert.match(tabSource, /parseTeacherTrainingImportFile\("participants"/);
  assert.match(tabSource, /已识别/);
  assert.match(importRoute, /parseTeacherTrainingWorkbookRows/);
  assert.match(importRoute, /kind !== "participants" && kind !== "courses"/);
  assert.match(importRoute, /jszip/);
  assert.match(importSource, /teacherTrainingParticipantImportColumnAliases/);
  assert.match(importSource, /所在学校/);
  assert.match(importSource, /findParticipantHeaderRowIndex/);
});

test("teacher training import and export transfers show bounded progress instead of raw navigation", () => {
  const tabSource = read("src/components/tabs/teacher-training-tab.tsx");

  assert.match(tabSource, /TEACHER_TRAINING_IMPORT_TIMEOUT_MS/);
  assert.match(tabSource, /AbortController/);
  assert.match(tabSource, /signal:\s*controller\.signal/);
  assert.match(tabSource, /省培文件识别超时，请稍后重试/);
  assert.match(tabSource, /participantImportLoading/);
  assert.match(tabSource, /courseImportLoading/);
  assert.match(tabSource, /正在识别参训教师名单/);
  assert.match(tabSource, /正在识别课程文件/);
  assert.match(tabSource, /downloadTeacherTrainingExport/);
  assert.match(tabSource, /exportingTeacherTrainingType/);
  assert.match(tabSource, /exportStatus/);
  assert.match(tabSource, /TEACHER_TRAINING_EXPORT_TIMEOUT_MS/);
  assert.match(tabSource, /exportController\.abort\(\)/);
  assert.match(tabSource, /signal:\s*exportController\.signal/);
  assert.match(tabSource, /导出生成超时，请稍后重试/);
  assert.match(tabSource, /URL\.createObjectURL/);
  assert.match(tabSource, /Content-Disposition/);
  assert.match(tabSource, /导出失败，请稍后重试/);
  assert.match(tabSource, /TEACHER_TRAINING_UPLOAD_URL_TIMEOUT_MS/);
  assert.match(tabSource, /uploadUrlController\.abort\(\)/);
  assert.match(tabSource, /signal:\s*uploadUrlController\.signal/);
  assert.match(tabSource, /附件上传准备超时，请稍后重试/);
  assert.doesNotMatch(tabSource, /href=\{`\$\{exportBaseUrl\}&type=\$\{item\.type\}`\}/);
});

test("teacher training PDF and attachment downloads stay in page with clear failures", () => {
  const tabSource = read("src/components/tabs/teacher-training-tab.tsx");

  assert.match(tabSource, /TEACHER_TRAINING_DOWNLOAD_TIMEOUT_MS/);
  assert.match(tabSource, /downloadTeacherTrainingFile/);
  assert.match(tabSource, /downloadingTeacherTrainingFile/);
  assert.match(tabSource, /teacherTrainingDownloadStatus/);
  assert.match(tabSource, /downloadController\.abort\(\)/);
  assert.match(tabSource, /signal:\s*downloadController\.signal/);
  assert.match(tabSource, /下载超时，请稍后重试/);
  assert.match(tabSource, /文件下载失败，请稍后重试/);
  assert.match(tabSource, /导出PDF请假单/);
  assert.match(tabSource, /PDF请假单/);
  assert.doesNotMatch(tabSource, /href=\{`\/api\/teacher-training\/leave-requests\/\$\{request\.id\}\/pdf`\}/);
  assert.doesNotMatch(tabSource, /href=\{currentSubmissionAttachmentFile\.downloadUrl\}/);
  assert.doesNotMatch(tabSource, /href=\{submission\.attachmentFile\.downloadUrl\}/);
});

test("teacher training participant import skips title rows and recognizes school headers", () => {
  const participants = parseTeacherTrainingParticipantImportText(
    [
      "江苏省职业院校创新创业教育指导能力提升培训参训教师名单",
      "序号\t教师姓名\t所在学校\t手机号\t分组\t职务",
      "1\t张三\t南京铁道职业技术学院\t13800000001\t第一组\t教师",
      "2\t李四\t江苏财经职业技术学院\t13800000002\t第二组\t教研室主任",
      "说明：请管理员核对后导入",
    ].join("\n"),
  );

  assert.equal(participants.length, 2);
  assert.deepEqual(
    participants.map((participant) => ({
      name: participant.name,
      organization: participant.organization,
      phone: participant.phone,
      groupName: participant.groupName,
      title: participant.title,
    })),
    [
      {
        name: "张三",
        organization: "南京铁道职业技术学院",
        phone: "13800000001",
        groupName: "第一组",
        title: "教师",
      },
      {
        name: "李四",
        organization: "江苏财经职业技术学院",
        phone: "13800000002",
        groupName: "第二组",
        title: "教研室主任",
      },
    ],
  );
});

test("teacher training attendance registration does not show account message actions", () => {
  const tabSource = read("src/components/tabs/teacher-training-tab.tsx");
  const attendanceSection = tabSource.match(/showTeacherTrainingSection\("attendance"\)[\s\S]*?showTeacherTrainingSection\("tasks"\)/)?.[0] ?? "";

  assert.ok(attendanceSection, "attendance section should exist");
  assert.doesNotMatch(attendanceSection, /copyAccountMessage/);
  assert.doesNotMatch(attendanceSection, /复制省培账号通知消息/);
  assert.doesNotMatch(attendanceSection, /一键复制账号消息/);
});

test("teacher training attendance registration records arrival room and materials status", () => {
  const tabSource = read("src/components/tabs/teacher-training-tab.tsx");
  const attendanceRoute = read("src/app/api/teacher-training/attendance/route.ts");
  const exportRoute = read("src/app/api/teacher-training/export/route.ts");
  const libSource = read("src/lib/teacher-training.ts");
  const attendanceSection = tabSource.match(/showTeacherTrainingSection\("attendance"\)[\s\S]*?showTeacherTrainingSection\("tasks"\)/)?.[0] ?? "";

  assert.match(tabSource, /attendanceRegistrationDraft/);
  assert.match(tabSource, /确认参训教师已报到/);
  assert.match(tabSource, /酒店房号/);
  assert.match(tabSource, /报到材料是否齐全/);
  assert.match(tabSource, /材料齐全/);
  assert.match(tabSource, /材料不齐全/);
  assert.match(tabSource, /待报到/);
  assert.match(attendanceRoute, /roomNumber/);
  assert.match(attendanceRoute, /materialsComplete/);
  assert.match(attendanceRoute, /buildTeacherTrainingAttendanceNote/);
  assert.match(libSource, /parseTeacherTrainingAttendanceNote/);
  assert.match(libSource, /teacherTrainingAttendancePendingLabel/);
  assert.match(libSource, /cohort\.participants\.map/);
  assert.match(libSource, /酒店房号/);
  assert.match(libSource, /材料齐全/);
  assert.match(exportRoute, /报到信息/);
  assert.doesNotMatch(attendanceSection, /请假|缺勤|报到登记日期|报到登记场次/);
});

test("teacher training course import accepts Word and PDF files", () => {
  const tabSource = read("src/components/tabs/teacher-training-tab.tsx");
  const importRoute = read("src/app/api/teacher-training/import/route.ts");

  assert.match(tabSource, /handleCourseImportFile/);
  assert.match(tabSource, /parseCourseImportRows/);
  assert.match(tabSource, /buildCourseImportPreview/);
  assert.match(tabSource, /上传课程文件/);
  assert.match(tabSource, /accept="\.docx,\.pdf,\.xlsx,\.csv,\.tsv,\.txt/);
  assert.match(tabSource, /parseTeacherTrainingImportFile\("courses"/);
  assert.match(importRoute, /mammoth\.extractRawText/);
  assert.match(importRoute, /extractPdfText/);
  assert.match(importRoute, /extractCourseRowsFromText/);
});

test("teacher training tab uses staff-side manual check-in controls", () => {
  const tabSource = read("src/components/tabs/teacher-training-tab.tsx");
  const contextSource = read("src/components/workspace-context.tsx");
  const shellSource = read("src/components/workspace-shell.tsx");

  assert.match(tabSource, /teacherTrainingSections/);
  assert.match(tabSource, /activeTeacherTrainingSection/);
  assert.match(contextSource, /teacherTrainingSectionTabs/);
  assert.match(contextSource, /activeTeacherTrainingSection/);
  assert.match(shellSource, /teacherTrainingSidebarSections/);
  assert.match(shellSource, /teacher-training-side-nav/);
  assert.match(shellSource, /aria-label="省培左侧模块"/);
  assert.match(shellSource, /省培管理平台/);
  assert.match(shellSource, /sidebarRoleLabel/);
  assert.match(shellSource, /data-section-key/);
  assert.match(shellSource, /!isTeacherTrainingPlatform/);
  assert.doesNotMatch(shellSource, /aria-label="省培顶部模块"/);
  assert.doesNotMatch(shellSource, /teacher-training-top-nav/);
  assert.doesNotMatch(tabSource, /省培模块导航/);
  assert.doesNotMatch(tabSource, /分区处理，不再堆叠/);
  for (const label of ["工作台", "班次管理", "参训教师", "课程安排", "报到签到", "任务汇报", "请假审批", "导出归档"]) {
    assert.match(contextSource, new RegExp(label));
  }
  assert.match(contextSource, /参训教师报到/);
  assert.match(shellSource, /openTeacherTrainingSection/);
  assert.match(tabSource, /teacher-training-content/);
  assert.doesNotMatch(tabSource, /快速进入/);
  assert.match(tabSource, /班次指挥台/);
  assert.match(tabSource, /报到房号材料登记/);
  assert.match(tabSource, /课程安排/);
  assert.match(tabSource, /createTeacherTrainingCourseSession/);
  assert.match(tabSource, /参训教师中心/);
  assert.match(tabSource, /参训教师名单/);
  assert.match(tabSource, /班主任/);
  assert.match(tabSource, /assignTeacherTrainingCohortManager/);
  assert.match(tabSource, /removeTeacherTrainingCohortManager/);
  assert.match(tabSource, /新增省培教师账号/);
  assert.match(tabSource, /已有平台账号/);
  assert.match(tabSource, /预录扩展信息/);
  assert.match(tabSource, /复制账号消息/);
  assert.match(tabSource, /generateTeacherTrainingAccountMessage/);
  assert.match(tabSource, /请假流程设置/);
  assert.match(tabSource, /审批步骤/);
  assert.match(tabSource, /每步通过人数/);
  assert.match(tabSource, /canConfigureTeacherTrainingLeaveFlow/);
  assert.match(tabSource, /currentUser\?\.role === "admin"/);
  assert.match(tabSource, /canManage \? "请假审批" : "临时请假"/);
  assert.match(tabSource, /canConfigureTeacherTrainingLeaveFlow && activeLeavePanel === "rules"/);
  assert.match(tabSource, /canManage \? \(/);
  assert.match(tabSource, /待审批申请/);
  assert.match(tabSource, /全部请假申请/);
  assert.doesNotMatch(tabSource, /canManageGlobal \? "请假流程设置" : "临时请假"/);
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
  assert.match(tabSource, /待报到/);
  assert.match(tabSource, /导出报到信息/);
  assert.doesNotMatch(tabSource, /二维码|扫码/);
});

test("teacher training navigation and leave approval center are role scoped", () => {
  const contextSource = read("src/components/workspace-context.tsx");
  const tabSource = read("src/components/tabs/teacher-training-tab.tsx");

  assert.match(contextSource, /teacherTrainingManagerSectionKeys/);
  assert.match(contextSource, /teacherTrainingParticipantSectionKeys/);
  assert.match(contextSource, /teacherTrainingSidebarSections = teacherTrainingSectionTabs\.filter/);
  assert.match(contextSource, /teacherTrainingManagerSectionKeys\.has\(section\.key\)/);
  assert.match(contextSource, /teacherTrainingParticipantSectionKeys\.has\(section\.key\)/);
  assert.doesNotMatch(contextSource, /if \(section\.teacherOnly && canManageTeacherTraining\) return false;/);

  assert.match(tabSource, /type TeacherTrainingLeavePanelKey = "pending" \| "all" \| "rules"/);
  assert.match(tabSource, /const \[activeLeavePanel, setActiveLeavePanel\]/);
  assert.match(tabSource, /teacherTrainingLeavePanelItems/);
  assert.match(tabSource, /待审批/);
  assert.match(tabSource, /全部申请/);
  assert.match(tabSource, /审批规则/);
  assert.match(tabSource, /canConfigureTeacherTrainingLeaveFlow && activeLeavePanel === "rules"/);
  assert.match(tabSource, /activeLeavePanel !== "rules"/);
  assert.match(tabSource, /managerVisibleLeaveRequests\.filter\(\(request\) => request\.status === "pending"\)/);
  assert.doesNotMatch(tabSource, /只在系统管理员账号下开放，避免班次工作人员误改全局审批规则。/);
});

test("teacher training tab supports location-based course check-in tasks", () => {
  const tabSource = read("src/components/tabs/teacher-training-tab.tsx");
  const contextSource = read("src/components/workspace-context.tsx");

  assert.match(tabSource, /发布签到任务/);
  assert.match(tabSource, /课程定位签到/);
  assert.match(tabSource, /定位签到/);
  assert.match(tabSource, /navigator\.geolocation/);
  assert.match(tabSource, /getTeacherTrainingCheckInWindowState/);
  assert.match(tabSource, /getTeacherTrainingCheckInWindowLabel/);
  assert.match(tabSource, /setInterval\(\(\) => setCheckInClock/);
  assert.match(tabSource, /签到进度/);
  assert.match(tabSource, /定位中/);
  assert.match(tabSource, /未签到/);
  assert.match(tabSource, /createTeacherTrainingCheckInTask/);
  assert.match(tabSource, /signTeacherTrainingCheckIn/);
  assert.match(tabSource, /导出课程签到/);
  assert.match(contextSource, /TeacherTrainingCheckInTaskDraft/);
  assert.match(contextSource, /TeacherTrainingCheckInSignDraft/);
});

test("teacher training interactions expose clear hints for mobile web users", () => {
  const tabSource = read("src/components/tabs/teacher-training-tab.tsx");
  const shellSource = read("src/components/workspace-shell.tsx");

  assert.match(tabSource, /teacherTrainingActionHints/);
  assert.match(tabSource, /省培操作提示/);
  assert.match(tabSource, /切换上方模块/);
  assert.doesNotMatch(tabSource, /左侧切换模块/);
  assert.doesNotMatch(tabSource, /左侧添加|右侧添加|后续接入|先统一入口/);
  assert.match(tabSource, /在参训教师模块添加名单后/);
  assert.match(tabSource, /导出名单、报到信息、课程签到和任务汇报/);
  assert.match(tabSource, /手机端定位签到/);
  assert.match(tabSource, /aria-label="使用当前位置填入签到坐标"/);
  assert.match(tabSource, /title="使用当前位置填入签到坐标"/);
  assert.match(tabSource, /aria-label="发布课程定位签到任务"/);
  assert.match(tabSource, /title="发布课程定位签到任务"/);
  assert.match(tabSource, /aria-label="定位签到，浏览器会请求当前位置权限"/);
  assert.match(tabSource, /title=\{checkInDisabledReason \|\| "定位签到，浏览器会请求当前位置权限"\}/);
  assert.match(tabSource, /getTeacherTrainingCheckInDisabledReason/);
  assert.match(tabSource, /teacherTrainingCheckInWindowMessages\[windowState\]/);
  assert.match(tabSource, /未绑定参训教师，请联系管理员确认省培账号/);
  assert.match(tabSource, /checkInDisabledReason \? \(/);
  assert.match(tabSource, /aria-label="提交省培请假申请"/);
  assert.match(tabSource, /title=\{leaveDisabledReason \|\| "提交省培请假申请"\}/);
  assert.match(tabSource, /aria-label="保存省培个人信息"/);
  assert.match(tabSource, /title=\{profileDisabledReason \|\| "保存省培个人信息"\}/);
  assert.match(tabSource, /aria-label="复制省培账号通知消息"/);
  assert.match(tabSource, /title="复制省培账号通知消息"/);
  assert.match(tabSource, /accountMessagesByParticipantId\[participant\.id\]/);
  assert.match(tabSource, /\$\{participant\.name\}省培账号通知消息/);
  assert.match(tabSource, /aria-label=\{`\$\{participant\.name\}\$\{attendance \? "修改报到信息" : "报到"\}`\}/);
  assert.match(tabSource, /title=\{`\$\{participant\.name\}\$\{attendance \? "修改报到信息" : "报到"\}`\}/);
  assert.doesNotMatch(shellSource, /打开省培模块导航/);
  assert.match(shellSource, /mobileNavigationTitle/);
});

test("teacher training form controls expose stable field hints after mobile input", () => {
  const tabSource = read("src/components/tabs/teacher-training-tab.tsx");
  const controls = Array.from(tabSource.matchAll(/<(input|select|textarea)\b[\s\S]*?(?:\/>|>)/g));
  const unlabeledControls = controls
    .map((match) => {
      const line = tabSource.slice(0, match.index).split("\n").length;
      return { line, source: match[0] };
    })
    .filter(({ source }) => !source.includes("...fieldHint(") && !source.includes("aria-label="));

  assert.equal(unlabeledControls.length, 0, unlabeledControls.map((control) => `line ${control.line}`).join(", "));
  assert.match(tabSource, /const fieldHint = \(label: string\)/);
  assert.match(tabSource, /\.\.\.fieldHint\("选择省培班次"\)/);
  assert.match(tabSource, /\.\.\.fieldHint\("培训名称"\)/);
  assert.match(tabSource, /\.\.\.fieldHint\("参训教师姓名"\)/);
  assert.match(tabSource, /\.\.\.fieldHint\("签到地点"\)/);
  assert.match(tabSource, /\.\.\.fieldHint\("请假原因"\)/);
  assert.match(tabSource, /\.\.\.fieldHint\("省培任务汇报内容"\)/);
});

test("teacher training teacher-facing forms keep visible field labels on mobile", () => {
  const tabSource = read("src/components/tabs/teacher-training-tab.tsx");

  assert.match(tabSource, /teacherTrainingFieldShellClassName/);
  assert.match(tabSource, /teacherTrainingFieldLabelClassName/);
  assert.match(tabSource, /我的省培入口/);
  assert.match(tabSource, /!canManage && showTeacherTrainingSection\("overview"\)/);
  assert.match(tabSource, /先处理下一步事项，再查看课程、请假和个人信息/);
  assert.match(tabSource, /teacherMobileNavigationSections/);
  assert.match(tabSource, /aria-label="老师端省培快捷导航"/);
  assert.match(tabSource, /返回工作台/);
  assert.match(tabSource, /effectiveTeacherTrainingSection !== "overview"/);
  for (const target of ["courses", "checkins", "tasks", "leave", "profile"]) {
    assert.match(tabSource, new RegExp(`openTeacherTrainingSection\\("${target}"\\)`));
  }
  for (const label of [
    "选择我的省培班次",
    "请假开始日期",
    "请假结束日期",
    "请假场次",
    "请假人",
    "请假原因",
    "个人姓名",
    "个人单位",
    "个人手机",
    "个人分组",
    "个人备注或培训需求",
    "选择省培汇报任务",
    "我的汇报身份",
    "省培任务汇报内容",
    "省培任务汇报附件",
  ]) {
    assert.match(tabSource, new RegExp(`<span className=\\{teacherTrainingFieldLabelClassName\\}>${label}<\\/span>`));
  }
  assert.match(tabSource, /teacherTrainingSubmissionAttachmentAcceptAttribute/);
  assert.match(tabSource, /submissionAttachmentProgress/);
  assert.match(tabSource, /uploadFileDirectly/);
  assert.match(tabSource, /type="file"/);
  assert.match(tabSource, /仅支持 Word\/PDF，单个/);
  assert.match(tabSource, /上传进度/);
  assert.match(tabSource, /附件：/);
  assert.match(tabSource, /已按当前省培账号锁定/);
  assert.match(tabSource, /canManage \? \([\s\S]*选择省培汇报教师[\s\S]*\) : \([\s\S]*我的汇报身份/);
  assert.match(tabSource, /canManage \? "管理员可按班次导出全部任务完成情况。" : "查看我的任务提交记录和完成情况。"/);
  assert.match(tabSource, /teacherTaskActionHint/);
  assert.match(tabSource, /确认我的汇报身份/);
  assert.match(tabSource, /填写后保存汇报/);
  assert.match(tabSource, /teacherSubmittedTaskIds/);
  assert.match(tabSource, /teacherPendingTaskCount/);
  assert.match(tabSource, /teacherTaskProgressItems/);
  assert.match(tabSource, /teacherTaskCompletionPercent/);
  assert.match(tabSource, /teacherTaskSummaryText/);
  assert.match(tabSource, /teacherSignedCheckInTaskIds/);
  assert.match(tabSource, /teacherPendingCheckInCount/);
  assert.match(tabSource, /teacherCheckInProgressItems/);
  assert.match(tabSource, /teacherCheckInOpenCount/);
  assert.match(tabSource, /teacherCheckInCompletionPercent/);
  assert.match(tabSource, /teacherCheckInSummaryText/);
  assert.match(tabSource, /teacherCheckInProgressMetaText/);
  assert.match(tabSource, /teacherCheckInQuickActionHelper/);
  assert.match(tabSource, /teacherProfileNeedsAttention/);
  assert.match(tabSource, /teacherMobilePriorityItems/);
  assert.match(tabSource, /teacherCourseTimeline/);
  assert.match(tabSource, /teacherNextCourse/);
  assert.match(tabSource, /teacherLeaveRequests/);
  assert.match(tabSource, /teacherLatestLeaveRequest/);
  assert.match(tabSource, /teacherProfileCompletionItems/);
  assert.match(tabSource, /teacherProfileCompletedCount/);
  assert.match(tabSource, /teacherProfileStatusText/);
  assert.match(tabSource, /aria-label="省培今日待办"/);
  assert.match(tabSource, />我的待办</);
  assert.match(tabSource, /aria-label="省培下一节课"/);
  assert.match(tabSource, /aria-label="省培请假进度"/);
  assert.match(tabSource, /aria-label="请假审批步骤条"/);
  assert.match(tabSource, /aria-label="省培个人资料状态"/);
  assert.match(tabSource, /aria-label="省培任务汇报进度"/);
  assert.match(tabSource, /aria-label="省培定位签到状态"/);
  assert.match(tabSource, /今日待办/);
  assert.match(tabSource, /下一节课/);
  assert.match(tabSource, /按时间顺序查看全部课程/);
  assert.match(tabSource, /后续课程待发布/);
  assert.match(tabSource, /资料状态/);
  assert.match(tabSource, /资料待完善/);
  assert.match(tabSource, /资料已完整/);
  assert.match(tabSource, /单位已填写/);
  assert.match(tabSource, /手机号已填写/);
  assert.match(tabSource, /当前请假进度/);
  assert.match(tabSource, /审批步骤/);
  assert.match(tabSource, /已通过/);
  assert.match(tabSource, /等待审批/);
  assert.match(tabSource, /未到达/);
  assert.match(tabSource, /待完成签到/);
  assert.match(tabSource, /待提交汇报/);
  assert.match(tabSource, /完善个人信息/);
  assert.match(tabSource, /今日事项已处理/);
  assert.match(tabSource, /待签到/);
  assert.match(tabSource, /已完成全部签到/);
  assert.match(tabSource, /我的签到状态/);
  assert.match(tabSource, /现在可签到/);
  assert.match(tabSource, /等待开放/);
  assert.match(tabSource, /签到已结束/);
  assert.match(tabSource, /已完成签到/);
  assert.match(tabSource, /等待管理员发布课程签到任务/);
  assert.match(tabSource, /focusTeacherCheckInTask/);
  assert.match(tabSource, /id=\{`teacher-training-checkin-\$\{task\.id\}`\}/);
  assert.match(tabSource, /id="teacher-training-submission-form"/);
  assert.match(tabSource, /focusTeacherTaskSubmission/);
  assert.match(tabSource, /待提交/);
  assert.match(tabSource, /已提交/);
  assert.match(tabSource, /我的汇报进度/);
  assert.match(tabSource, /任务已提交/);
  assert.match(tabSource, /任务待提交/);
  assert.match(tabSource, /暂无任务发布/);
  assert.match(tabSource, /继续填写汇报/);
  assert.match(tabSource, /更新汇报/);
  assert.match(tabSource, /teacherTrainingDisabledHintClassName/);
  assert.match(tabSource, /getTeacherTrainingParticipantDisabledReason/);
  assert.match(tabSource, /getTeacherTrainingLeaveDisabledReason/);
  assert.match(tabSource, /getTeacherTrainingSubmissionDisabledReason/);
  assert.match(tabSource, /管理员尚未配置请假审批流程，请联系省培负责人、班主任或管理员/);
  assert.match(tabSource, /请填写请假原因后再提交/);
  assert.match(tabSource, /暂无省培任务，请等待管理员发布任务/);
  assert.match(tabSource, /请填写汇报内容后再保存/);
  assert.match(tabSource, /leaveDisabledReason \? \(/);
  assert.match(tabSource, /profileDisabledReason \? \(/);
  assert.match(tabSource, /submissionDisabledReason \? \(/);
  assert.match(tabSource, /!canManage && effectiveTeacherTrainingSection === "tasks"/);
});

test("teacher training manager forms keep visible field labels on mobile", () => {
  const tabSource = read("src/components/tabs/teacher-training-tab.tsx");

  for (const label of [
    "选择省培班次",
    "培训名称",
    "培训地点",
    "培训开始日期",
    "培训结束日期",
    "培训说明",
    "参训教师姓名",
    "参训教师单位",
    "参训教师手机",
    "参训教师分组",
    "省培登录账号",
    "省培初始密码",
    "参训教师预录扩展信息",
    "参训教师备注",
    "省培职务",
    "课程名称",
    "课程日期",
    "课程开始时间",
    "课程结束时间",
    "课程地点",
    "授课教师",
    "课程说明",
    "签到标题",
    "绑定课程",
    "签到日期",
    "签到开始时间",
    "签到结束时间",
    "签到地点",
    "签到地点纬度",
    "签到地点经度",
    "有效签到范围米数",
    "请假审批步骤名称",
    "请假审批每步通过人数",
    "请假审批意见",
    "酒店房号",
    "报到材料是否齐全",
    "报到备注",
    "省培任务名称",
    "省培任务说明",
    "省培任务截止日期",
    "省培任务附件要求",
  ]) {
    assert.match(tabSource, new RegExp(`<span className=\\{teacherTrainingFieldLabelClassName\\}>${label}<\\/span>`));
  }
});

test("teacher training cohort lead is configured above class teachers without changing approval flow rules", () => {
  const tabSource = read("src/components/tabs/teacher-training-tab.tsx");
  const managerRoute = read("src/app/api/teacher-training/cohort-managers/route.ts");

  assert.match(managerRoute, /无权限设置省培负责人或班主任/);
  assert.match(managerRoute, /只能选择已审核通过的非专家账号作为省培负责人或班主任/);
  assert.match(tabSource, /teacherTrainingManagerRoleOptions/);
  assert.match(tabSource, /title:\s*"省培负责人"/);
  assert.match(tabSource, /title:\s*"班主任"/);
  assert.match(tabSource, /班次负责人\/班主任设置/);
  assert.match(tabSource, /选择省培负责人账号/);
  assert.match(tabSource, /选择班主任账号/);
  assert.match(tabSource, /设置省培负责人/);
  assert.match(tabSource, /设置班主任/);
  assert.match(tabSource, /getTeacherTrainingManagerRoleRank/);
  assert.match(tabSource, /两者省培管理权限一致/);
  assert.match(tabSource, /请假审批顺序以请假审批模块配置为准/);
  assert.match(tabSource, /teacherTrainingConfigStatusItems/);
  assert.match(tabSource, /班次配置状态/);
  assert.match(tabSource, /审批人/);
  assert.doesNotMatch(tabSource, /负责人审批/);
  assert.doesNotMatch(tabSource, /班主任审批/);
  assert.match(tabSource, /approverLabelById\.get\(approver\.id\) \?\? approver\.name/);
});

test("teacher training cohort management shows every configured cohort with direct edit and delete actions", () => {
  const tabSource = read("src/components/tabs/teacher-training-tab.tsx");
  const mainRouteSource = read("src/app/api/teacher-training/route.ts");

  assert.match(tabSource, /已设置班次/);
  assert.match(tabSource, /共 \{teacherTrainingCohorts\.length\} 个班次/);
  assert.match(tabSource, /班次总数/);
  assert.match(tabSource, /teacherTrainingCohorts\.map\(\(cohort\) => \(/);
  assert.match(tabSource, /editCohort\(cohort\)/);
  assert.match(tabSource, /removeCohort\(cohort\)/);
  assert.match(tabSource, /nextCohortIdAfterDelete/);
  assert.match(tabSource, /setSelectedCohortId\(nextCohortIdAfterDelete\)/);
  assert.match(mainRouteSource, /hasTeacherTrainingCohortManageAccess/);
  assert.match(mainRouteSource, /无权限修改该省培班次/);
  assert.match(mainRouteSource, /无权限删除该省培班次/);
});

test("teacher training deletes managed records directly after two explicit confirmations", () => {
  const mainRouteSource = read("src/app/api/teacher-training/route.ts");
  const courseRouteSource = read("src/app/api/teacher-training/course-sessions/route.ts");
  const checkInRouteSource = read("src/app/api/teacher-training/check-ins/route.ts");
  const taskRouteSource = read("src/app/api/teacher-training/tasks/route.ts");
  const tabSource = read("src/components/tabs/teacher-training-tab.tsx");
  const contextSource = read("src/components/workspace-context.tsx");

  for (const source of [mainRouteSource, courseRouteSource, checkInRouteSource, taskRouteSource]) {
    assert.match(source, /\.delete\(\{ where: \{ id \} \}\)/);
    assert.doesNotMatch(source, /deletedAt:\s*new Date\(\)/);
  }

  assert.match(mainRouteSource, /deleteStoredFile/);
  assert.match(taskRouteSource, /deleteStoredFile/);
  assert.match(mainRouteSource, /@\/lib\/teacher-training-submission-attachments/);
  assert.match(taskRouteSource, /@\/lib\/teacher-training-submission-attachments/);
  assert.match(tabSource, /请再次确认永久删除/);
  assert.match(tabSource, /删除后无法恢复/);
  assert.doesNotMatch(tabSource, /省培回收站/);
  assert.doesNotMatch(tabSource, /refreshTeacherTrainingRecycleBin/);
  assert.doesNotMatch(tabSource, /restoreTeacherTrainingRecycleItem/);
  assert.doesNotMatch(tabSource, /permanentlyDeleteTeacherTrainingRecycleItem/);
  assert.doesNotMatch(contextSource, /已移入回收站/);
  assert.doesNotMatch(contextSource, /可在回收站恢复/);
});

test("teacher training leave approval panel keeps desktop review cards readable", () => {
  const tabSource = read("src/components/tabs/teacher-training-tab.tsx");

  assert.match(tabSource, /displayedManagerLeaveRequests/);
  assert.match(tabSource, /activeLeavePanel === "pending"/);
  assert.match(tabSource, /rounded-2xl border border-slate-200\/70 bg-white px-4 py-4 shadow-sm/);
  assert.match(tabSource, /xl:grid-cols-\[minmax\(0,1fr\)_auto\]/);
  assert.match(tabSource, /flex shrink-0 flex-wrap justify-end gap-2/);
});

test("teacher training leave flow avoids fake default steps and blocks incomplete approval setup", () => {
  const tabSource = read("src/components/tabs/teacher-training-tab.tsx");
  const leaveFlowRoute = read("src/app/api/teacher-training/leave-flow/route.ts");

  assert.match(leaveFlowRoute, /每个审批步骤至少选择一名审批人/);
  assert.match(leaveFlowRoute, /每步通过人数不能超过已选审批人数/);
  assert.match(tabSource, /getTeacherTrainingLeaveFlowStepName/);
  assert.match(tabSource, /normalizeLeaveFlowStepsForConfirm/);
  assert.match(tabSource, /leaveFlowConfigurationInvalidReason/);
  assert.match(tabSource, /审批流程不完整/);
  assert.match(tabSource, /保存后，新提交的请假按新流程审批；已提交请假保留原流程记录/);
  assert.match(tabSource, /已选 \{step\.approverIds\.length\} 人/);
  assert.match(tabSource, /window\.confirm\(`确认\$\{decision === "approve" \? "通过" : "驳回"\}/);
  assert.doesNotMatch(tabSource, /name:\s*`第\$\{baseSteps\.length \+ 1\}步审批`/);
});

test("teacher training leave approval shows completed state and only exports approved PDFs", () => {
  const leaveReviewRoute = read("src/app/api/teacher-training/leave-requests/[leaveRequestId]/review/route.ts");
  const leavePdfRoute = read("src/app/api/teacher-training/leave-requests/[leaveRequestId]/pdf/route.ts");
  const tabSource = read("src/components/tabs/teacher-training-tab.tsx");

  assert.match(leaveReviewRoute, /currentStepIndex:\s*approvalSteps\.length/);
  assert.match(leavePdfRoute, /leaveRequest\.status !== "approved"/);
  assert.match(leavePdfRoute, /全部审批通过后才能导出PDF请假单/);
  assert.match(tabSource, /const step = request\.status === "pending" \? request\.approvalSteps\[request\.currentStepIndex\] : null/);
  assert.match(tabSource, /request\.status === "approved" \? \(/);
  assert.match(tabSource, /审批完成后可导出PDF/);
});

test("teacher training leave requests reject invalid ranges and enforce configured approvers", () => {
  const leaveRequestRoute = read("src/app/api/teacher-training/leave-requests/route.ts");
  const leaveReviewRoute = read("src/app/api/teacher-training/leave-requests/[leaveRequestId]/review/route.ts");

  assert.match(leaveRequestRoute, /validateTeacherTrainingLeaveRange/);
  assert.equal(
    validateTeacherTrainingLeaveRange({
      startDate: "2026-05-30",
      endDate: "2026-05-30",
      startTime: "14:00",
      endTime: "13:59",
    }),
    "请假结束时间不能早于开始时间",
  );
  assert.equal(
    validateTeacherTrainingLeaveRange({
      startDate: "2026-05-31",
      endDate: "2026-05-30",
      startTime: null,
      endTime: null,
    }),
    "请假结束时间不能早于开始时间",
  );
  assert.equal(
    validateTeacherTrainingLeaveRange({
      startDate: "2026-05-30",
      endDate: "2026-05-30",
      startTime: "09:00",
      endTime: "11:30",
    }),
    "",
  );
  assert.equal(
    validateTeacherTrainingLeaveRange({
      startDate: "2026-05-01",
      endDate: "2026-06-02",
      startTime: null,
      endTime: null,
    }),
    "单次请假最长不能超过31天",
  );
  assert.match(leaveReviewRoute, /if \(!currentStep\.approverIds\.includes\(user\.id\)\)/);
  assert.doesNotMatch(leaveReviewRoute, /user\.role !== "admin"/);
  assert.doesNotMatch(leaveReviewRoute, /dates\.length < 31/);
});

test("teacher training submission archive exports laid out A4 DOCX reports", () => {
  const exportRoute = read("src/app/api/teacher-training/export/route.ts");
  const libSource = read("src/lib/teacher-training.ts");

  assert.match(exportRoute, /省培任务汇报\.docx/);
  assert.doesNotMatch(exportRoute, /省培任务汇报\.doc`/);
  assert.match(libSource, /createZipArchive/);
  assert.match(libSource, /\[Content_Types\]\.xml/);
  assert.match(libSource, /word\/document\.xml/);
  assert.match(libSource, /application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document\.main\+xml/);
  assert.match(libSource, /w:pgSz w:w="11906" w:h="16838"/);
  assert.match(libSource, /w:pgMar/);
  assert.match(libSource, /汇报内容/);
  assert.match(libSource, /attachmentLabel/);
  assert.match(libSource, /attachmentFile/);
  assert.match(libSource, /buildTeacherTrainingSubmissionAttachmentDownloadUrl/);
  assert.doesNotMatch(libSource, /<!doctype html/);
});

test("teacher training task reports support one Word or PDF attachment with upload progress", () => {
  const attachmentSource = read("src/lib/teacher-training-submission-attachments.ts");
  const uploadRouteSource = read("src/app/api/teacher-training/submissions/upload-url/route.ts");
  const downloadRouteSource = read("src/app/api/teacher-training/submissions/[submissionId]/attachment/route.ts");
  const submissionsRouteSource = read("src/app/api/teacher-training/submissions/route.ts");
  const tabSource = read("src/components/tabs/teacher-training-tab.tsx");
  const contextSource = read("src/components/workspace-context.tsx");
  const exportRouteSource = read("src/app/api/teacher-training/export/route.ts");

  assert.match(attachmentSource, /teacherTrainingSubmissionAttachmentAcceptAttribute = "\.doc,\.docx,\.pdf"/);
  assert.match(attachmentSource, /teacherTrainingSubmissionAttachmentMaxSizeLabel = "20MB"/);
  assert.match(attachmentSource, /validateTeacherTrainingSubmissionAttachmentMeta/);
  assert.match(attachmentSource, /任务汇报附件仅支持 Word 或 PDF 文件/);
  assert.match(uploadRouteSource, /getSignedUrl/);
  assert.match(uploadRouteSource, /validateTeacherTrainingSubmissionAttachmentMeta/);
  assert.match(uploadRouteSource, /ContentLength:\s*fileSize/);
  assert.match(attachmentSource, /teacher-training-submissions/);
  assert.match(uploadRouteSource, /getTeacherTrainingSubmissionAttachmentObjectKeyPrefix/);
  assert.match(uploadRouteSource, /encodeTeacherTrainingSubmissionAttachmentFile/);
  assert.match(downloadRouteSource, /readStoredFile/);
  assert.match(downloadRouteSource, /decodeTeacherTrainingSubmissionAttachmentFile/);
  assert.match(downloadRouteSource, /hasTeacherTrainingCohortManageAccess/);
  assert.match(downloadRouteSource, /附件文件不存在或已丢失/);
  assert.match(submissionsRouteSource, /decodeTeacherTrainingSubmissionAttachmentFile/);
  assert.match(submissionsRouteSource, /请通过上传控件上传 Word 或 PDF 附件/);
  assert.match(submissionsRouteSource, /getTeacherTrainingSubmissionAttachmentObjectKeyPrefix/);
  assert.match(submissionsRouteSource, /HeadObjectCommand/);
  assert.match(submissionsRouteSource, /真实附件大小不能超过 20MB/);
  assert.match(submissionsRouteSource, /deleteStoredFile\(attachmentFile\.filePath\)/);
  assert.match(submissionsRouteSource, /previousAttachmentFilePath/);
  assert.match(submissionsRouteSource, /previousAttachmentFilePath !== attachmentFile\?\.filePath/);
  assert.match(tabSource, /submissionAttachmentProgress/);
  assert.match(tabSource, /if \(submissionDisabledReason\) \{/);
  assert.match(tabSource, /savedSubmissionAttachmentFile/);
  assert.match(tabSource, /submissionSaveStatus/);
  assert.match(tabSource, /isReplacingSavedSubmissionAttachment/);
  assert.match(tabSource, /isRemovingSavedSubmissionAttachment/);
  assert.match(tabSource, /保存后将替换原附件，原附件会从系统文件库删除/);
  assert.match(tabSource, /确认保存并替换原附件/);
  assert.match(tabSource, /替换附件会删除上一份附件/);
  assert.match(tabSource, /现在只会标记移除，点击保存汇报后，原附件会从系统文件库删除/);
  assert.match(tabSource, /确认保存并删除原附件/);
  assert.match(tabSource, /已标记移除原附件，保存后会从系统文件库删除/);
  assert.match(tabSource, /汇报已保存，附件已入库/);
  assert.match(tabSource, /汇报已保存，原附件已替换/);
  assert.match(tabSource, /汇报已保存，原附件已删除/);
  assert.match(tabSource, /selectedTask\?\.requireAttachment/);
  assert.match(tabSource, /Workspace\.uploadFileDirectly/);
  assert.match(tabSource, /teacherTrainingSubmissionAttachmentAcceptAttribute/);
  assert.match(tabSource, /任务汇报附件仅支持/);
  assert.match(contextSource, /export \* from "@\/lib\/teacher-training-submission-attachments"/);
  assert.match(contextSource, /return true/);
  assert.match(exportRouteSource, /任务附件/);
  assert.match(exportRouteSource, /readStoredFile/);
});

test("teacher training destructive and import paths include reviewer-requested safeguards", () => {
  const mainRouteSource = read("src/app/api/teacher-training/route.ts");
  const taskRouteSource = read("src/app/api/teacher-training/tasks/route.ts");
  const participantRouteSource = read("src/app/api/teacher-training/participants/route.ts");
  const signRouteSource = read("src/app/api/teacher-training/check-ins/sign/route.ts");
  const leaveRequestRoute = read("src/app/api/teacher-training/leave-requests/route.ts");
  const leaveReviewRoute = read("src/app/api/teacher-training/leave-requests/[leaveRequestId]/review/route.ts");
  const profileRoute = read("src/app/api/teacher-training/profile/route.ts");
  const tabSource = read("src/components/tabs/teacher-training-tab.tsx");
  const checkInStatusBadgeSource = read("src/components/teacher-training/check-in-record-status-badge.tsx");
  const teacherTrainingLibSource = read("src/lib/teacher-training.ts");
  const leavePdfRoute = read("src/app/api/teacher-training/leave-requests/[leaveRequestId]/pdf/route.ts");
  const contextSource = read("src/components/workspace-context.tsx");

  assert.match(mainRouteSource, /confirmCascade/);
  assert.match(mainRouteSource, /删除前请确认/);
  assert.match(mainRouteSource, /teacherTrainingCohort\.delete/);
  assert.match(mainRouteSource, /deleteStoredFile/);
  assert.match(mainRouteSource, /@\/lib\/teacher-training-submission-attachments/);
  assert.match(taskRouteSource, /teacherTrainingTask\.delete/);
  assert.match(taskRouteSource, /deleteStoredFile/);
  assert.match(taskRouteSource, /@\/lib\/teacher-training-submission-attachments/);
  assert.match(contextSource, /confirmCascade:\s*true/);
  assert.match(tabSource, /参训教师 \$\{cohort\.stats\.participantCount\} 人/);
  assert.match(tabSource, /请再次确认永久删除/);
  assert.match(tabSource, /删除后无法恢复/);
  assert.doesNotMatch(tabSource, /任务汇报和附件不会立即删除/);
  assert.doesNotMatch(tabSource, /永久删除后才会清理/);

  assert.match(participantRouteSource, /duplicatedImportedParticipantKeys/);
  assert.match(participantRouteSource, /名单中存在重复教师/);
  assert.match(participantRouteSource, /该班次已存在相同姓名和单位或相同手机号的参训教师/);

  assert.doesNotMatch(signRouteSource, /accuracy_review/);
  assert.match(tabSource, /TeacherTrainingCheckInRecordStatusBadge/);
  assert.match(checkInStatusBadgeSource, /人工确认/);
  assert.doesNotMatch(checkInStatusBadgeSource, /精度待复核/);
  assert.match(tabSource, /人工补签/);
  assert.match(tabSource, /manualSignTeacherTrainingCheckIn/);
  assert.match(teacherTrainingLibSource, /getTeacherTrainingCheckInRecordStatusLabel/);
  assert.match(tabSource, /签到率/);
  assert.match(tabSource, /conic-gradient/);
  assert.match(tabSource, /报到状态/);
  assert.match(tabSource, /酒店房号/);
  assert.match(tabSource, /导出可能需要几十秒/);
  assert.match(teacherTrainingLibSource, /teacherTrainingRoleTitleLabels/);
  assert.match(leavePdfRoute, /teacherTrainingRoleTitleLabels/);
  assert.doesNotMatch(leavePdfRoute, /const roleTitleLabels/);

  for (const source of [leaveRequestRoute, leaveReviewRoute, profileRoute]) {
    assert.match(source, /auditLog\.create/);
    assert.match(source, /teacher_training\.notification\.failed/);
  }
});

test("teacher training check-in distance allows bounded GPS drift without review workload", () => {
  assert.equal(getAllowedTeacherTrainingCheckInDistanceMeters(500, null), 500);
  assert.equal(getAllowedTeacherTrainingCheckInDistanceMeters(500, 68.4), 568);
  assert.equal(getAllowedTeacherTrainingCheckInDistanceMeters(500, 999), 700);
});

test("teacher training workspace loads cohort summaries first and hydrates selected cohort details on demand", () => {
  const routeSource = read("src/app/api/teacher-training/route.ts");
  const contextSource = read("src/components/workspace-context.tsx");
  const tabSource = read("src/components/tabs/teacher-training-tab.tsx");
  const loadingBannerSource = read("src/components/teacher-training/cohort-detail-loading-banner.tsx");

  assert.match(routeSource, /mode\s*=\s*searchParams\.get\("mode"\)/);
  assert.match(routeSource, /cohortId\s*=\s*searchParams\.get\("cohortId"\)/);
  assert.match(routeSource, /buildTeacherTrainingSummaryInclude/);
  assert.match(routeSource, /serializeTeacherTrainingCohortSummary/);
  assert.match(routeSource, /includeDetails:\s*false/);

  assert.match(contextSource, /loadTeacherTrainingCohortDetails/);
  assert.match(contextSource, /\/api\/teacher-training\?mode=summary/);
  assert.match(contextSource, /\/api\/teacher-training\?cohortId=/);
  assert.match(contextSource, /mergeTeacherTrainingCohortDetails/);
  assert.match(tabSource, /loadTeacherTrainingCohortDetails\(selectedCohort\.id\)/);
  assert.match(tabSource, /selectedCohort\.includeDetails === false/);
  assert.match(tabSource, /TeacherTrainingCohortDetailLoadingBanner/);
  assert.match(loadingBannerSource, /正在加载班次明细/);
});

test("teacher training manager task page keeps one publish entry and hides report entry", () => {
  const tabSource = read("src/components/tabs/teacher-training-tab.tsx");

  assert.match(tabSource, /const showTeacherTrainingSubmissionForm = !canManage/);
  assert.match(tabSource, /showTeacherTrainingSubmissionForm \? \(/);
  assert.doesNotMatch(tabSource, />登记汇报</);
  assert.match(tabSource, /管理者只发布任务，参训教师登录后自行填写汇报/);
});

test("teacher training course editor keeps date field readable in the side panel", () => {
  const tabSource = read("src/components/tabs/teacher-training-tab.tsx");

  assert.match(tabSource, /xl:grid-cols-\[minmax\(0,1fr\)_minmax\(420px,460px\)\]/);
  assert.match(tabSource, /sm:grid-cols-2 2xl:grid-cols-\[minmax\(150px,1\.2fr\)_minmax\(118px,\.9fr\)_minmax\(118px,\.9fr\)\]/);
  assert.match(tabSource, /sm:col-span-2 2xl:col-span-1/);
  assert.match(tabSource, /className=\{\`\$\{fieldClassName\} min-w-0`\}/);
});

test("teacher training overview endpoint badge keeps text on one line", () => {
  const tabSource = read("src/components/tabs/teacher-training-tab.tsx");

  assert.match(tabSource, /min-w-\[76px\]/);
  assert.match(tabSource, /whitespace-nowrap/);
  assert.match(tabSource, /\{canManage \? "管理端" : "教师端"\}/);
});

test("teacher training overview metric cards jump to filtered detail lists", () => {
  const tabSource = read("src/components/tabs/teacher-training-tab.tsx");
  const sectionOpenMatches = tabSource.match(/const openTeacherTrainingSection =/g) ?? [];

  assert.equal(sectionOpenMatches.length, 1);
  assert.match(tabSource, /const openOverviewMetric =/);
  assert.match(tabSource, /teacherTrainingDetailViewTitle/);
  assert.match(tabSource, /当前查看：/);
  assert.match(tabSource, /已报到教师/);
  assert.match(tabSource, /请假教师/);
  assert.match(tabSource, /课程签到记录/);
  assert.match(tabSource, /已提交汇报/);
  assert.match(tabSource, /TeacherTrainingFilterSummary/);
  assert.match(tabSource, /openOverviewMetric\(\{ attendanceFilter: "registered", detailViewTitle: "已报到教师", section: "attendance" \}\)/);
  assert.match(tabSource, /openOverviewMetric\(\{ attendanceFilter: "leave", detailViewTitle: "请假教师", section: "attendance" \}\)/);
  assert.match(tabSource, /openOverviewMetric\(\{ attendanceFilter: "absent", detailViewTitle: "缺勤教师", section: "attendance" \}\)/);
  assert.match(tabSource, /openOverviewMetric\(\{ detailViewTitle: "已提交汇报", section: "tasks", submissionFilter: "submitted" \}\)/);
  assert.match(tabSource, /metricCards\.map\(\(\{ label, value, Icon, onClick, title \}\) => \(/);
  assert.match(tabSource, /aria-label=\{`查看省培\$\{label\}明细`\}/);
  assert.match(tabSource, /onClick=\{onClick\}/);
  assert.match(tabSource, /attendanceOverviewFilters\.map/);
  assert.match(tabSource, /setAttendanceOverviewFilter\(item\.key\)/);
  assert.match(tabSource, /submissionOverviewFilters\.map/);
  assert.match(tabSource, /setSubmissionOverviewFilter\(item\.key\)/);
  assert.match(tabSource, /getParticipantAttendanceRecord\(participant, "leave"\)/);
  assert.match(tabSource, /getParticipantAttendanceRecord\(participant, "absent"\)/);
});

test("teacher training overview works as a role-specific command desk", () => {
  const tabSource = read("src/components/tabs/teacher-training-tab.tsx");

  assert.match(tabSource, /managerCommandTodoCards/);
  assert.match(tabSource, /managerCommandQuickLinks/);
  assert.match(tabSource, /班次指挥台/);
  assert.match(tabSource, /当前班次/);
  assert.match(tabSource, /核心待办/);
  assert.match(tabSource, /快捷入口/);
  assert.match(tabSource, /待审批请假/);
  assert.match(tabSource, /待报到教师/);
  assert.match(tabSource, /未完成签到/);
  assert.match(tabSource, /未提交任务/);
  assert.match(tabSource, /openTeacherTrainingSection\("exports"\)/);

  assert.match(tabSource, /teacherCommandTodoCards/);
  assert.match(tabSource, /我的待办/);
  assert.match(tabSource, /今日课程/);
  assert.match(tabSource, /定位签到/);
  assert.match(tabSource, /任务汇报/);
  assert.match(tabSource, /临时请假/);
  assert.match(tabSource, /个人信息/);
  assert.match(tabSource, /教师端常用操作/);
  assert.doesNotMatch(tabSource, /快去|赶紧|马上弄|搞一下/);
});

test("teacher training list filters and cohort health check use clear operational copy", () => {
  const tabSource = read("src/components/tabs/teacher-training-tab.tsx");

  assert.match(tabSource, /teacherTrainingFilterSummaries/);
  assert.match(tabSource, /当前筛选/);
  assert.match(tabSource, /搜索条件/);
  assert.match(tabSource, /清除筛选/);
  assert.match(tabSource, /参训教师、报到、请假、汇报和课程签到列表共用筛选提示/);
  assert.match(tabSource, /解绑后，该教师将不能再通过此参训档案进入省培系统/);
  assert.match(tabSource, /重置密码后，请把新账号信息重新发给教师/);
  assert.match(tabSource, /导入前请核对识别字段和重复项/);
  assert.match(tabSource, /替换附件会删除上一份附件/);
  assert.match(tabSource, /cohortHealthCheckItems/);
  assert.match(tabSource, /班次配置体检/);
  assert.match(tabSource, /影响使用/);
  assert.match(tabSource, /建议补齐/);
  assert.match(tabSource, /教师名单/);
  assert.match(tabSource, /课程安排/);
  assert.match(tabSource, /请假审批人/);
});

test("teacher training arrival reporting is required for first teacher login and exportable by managers", () => {
  const libSource = read("src/lib/teacher-training.ts");
  const profileRoute = read("src/app/api/teacher-training/profile/route.ts");
  const participantsRoute = read("src/app/api/teacher-training/participants/route.ts");
  const exportRoute = read("src/app/api/teacher-training/export/route.ts");
  const contextSource = read("src/components/workspace-context.tsx");
  const tabSource = read("src/components/tabs/teacher-training-tab.tsx");

  assert.match(libSource, /TeacherTrainingArrivalInfoItem/);
  assert.match(libSource, /parseTeacherTrainingArrivalInfo/);
  assert.match(libSource, /mergeTeacherTrainingParticipantExtraInfo/);
  assert.match(libSource, /arrivalAt/);
  assert.match(libSource, /transportationLabel/);
  assert.match(profileRoute, /arrivalAt\?:/);
  assert.match(profileRoute, /预计到达时间/);
  assert.match(profileRoute, /mergeTeacherTrainingParticipantExtraInfo/);
  assert.match(participantsRoute, /arrivalAt\?:/);
  assert.match(contextSource, /arrivalAt:\s*draft\.arrivalAt\.trim\(\)/);
  assert.match(tabSource, /teacherInitialProfileRequired/);
  assert.match(tabSource, /activeTeacherTrainingSection !== "profile"/);
  assert.match(tabSource, /首次登录需先完成报到信息/);
  assert.match(tabSource, /保存后进入主界面/);
  assert.match(tabSource, /预计到达时间/);
  assert.match(tabSource, /交通方式/);
  assert.match(tabSource, /车次\/航班\/车牌/);
  assert.match(tabSource, /首次登录后请及时修改初始密码/);
  assert.match(tabSource, /getTeacherTrainingProfileDisabledReason\(effectiveProfileDraft\)/);
  assert.doesNotMatch(tabSource, /同行人数|住宿需求|到达备注|arrivalLodgingOptions/);
  assert.doesNotMatch(exportRoute, /同行人数|住宿需求|到达备注/);
  assert.match(tabSource, /batchGeneratePhoneAccounts/);
  assert.match(tabSource, /批量按手机号分配账号/);
  assert.match(exportRoute, /arrivals/);
  assert.match(libSource, /预计到达时间/);
  assert.match(libSource, /交通方式/);
  assert.match(libSource, /车次\/航班\/车牌/);
  assert.match(profileRoute, /请填写姓名、单位、手机、分组、职务、邮箱、预计到达时间、交通方式、车次\/航班\/车牌和出发地/);
  assert.match(profileRoute, /emailChanged/);
  assert.match(profileRoute, /emailStatus/);
  assert.match(tabSource, /profileSaveStatus/);
  assert.match(tabSource, /邮件提醒状态/);
  assert.match(profileRoute, /sendEmail/);
  assert.match(profileRoute, /省培资料已完善/);
  assert.match(profileRoute, /请及时修改初始密码/);
});

test("teacher training managers can reset participant account and password in provincial training", () => {
  const tabSource = read("src/components/tabs/teacher-training-tab.tsx");
  const accountRoute = read("src/app/api/teacher-training/participants/[participantId]/account/route.ts");

  assert.match(tabSource, /重置账号密码/);
  assert.match(tabSource, /省培账号重置密码/);
  assert.match(accountRoute, /accountPassword/);
  assert.match(accountRoute, /buildTeacherTrainingAccountMessage/);
  assert.match(accountRoute, /hasTeacherTrainingCohortManageAccess/);
});

test("workspace unit footer does not cover teacher training forms", () => {
  const shellSource = read("src/components/workspace-shell.tsx");
  const footerMatch = shellSource.match(/function WorkspaceUnitFooter\(\) \{[\s\S]*?<\/footer>/);

  assert.ok(footerMatch, "WorkspaceUnitFooter should be present");
  assert.doesNotMatch(footerMatch[0], /\bfixed\b/);
  assert.doesNotMatch(footerMatch[0], /\bbottom-0\b/);
  assert.match(footerMatch[0], /\bmt-8\b/);
});
