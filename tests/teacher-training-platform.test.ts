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
  assert.match(checkInRoute, /请同时填写纬度和经度/);
  assert.match(checkInRoute, /经纬度范围不正确/);
  assert.match(checkInSignRoute, /calculateDistanceMeters/);
  assert.match(checkInSignRoute, /getTeacherTrainingCheckInWindowState/);
  assert.match(checkInSignRoute, /teacherTrainingCheckInWindowMessages/);
  assert.match(checkInSignRoute, /定位坐标不正确/);
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
  const contextSource = read("src/components/workspace-context.tsx");
  const shellSource = read("src/components/workspace-shell.tsx");

  assert.match(tabSource, /teacherTrainingSections/);
  assert.match(tabSource, /activeTeacherTrainingSection/);
  assert.match(contextSource, /teacherTrainingSectionTabs/);
  assert.match(contextSource, /activeTeacherTrainingSection/);
  assert.match(shellSource, /teacherTrainingSidebarSections/);
  assert.match(shellSource, /data-section-key/);
  assert.doesNotMatch(tabSource, /省培模块导航/);
  assert.doesNotMatch(tabSource, /分区处理，不再堆叠/);
  for (const label of ["工作台", "班次管理", "参训教师", "课程安排", "报到签到", "任务汇报", "请假审批", "导出归档"]) {
    assert.match(contextSource, new RegExp(label));
  }
  assert.match(contextSource, /报到登记/);
  assert.match(shellSource, /openTeacherTrainingSection/);
  assert.match(tabSource, /teacher-training-content/);
  assert.doesNotMatch(tabSource, /快速进入/);
  assert.match(tabSource, /省培运行总览/);
  assert.match(tabSource, /工作人员后台勾选/);
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
  assert.match(tabSource, /左上角菜单切换模块/);
  assert.doesNotMatch(tabSource, /左侧切换模块/);
  assert.doesNotMatch(tabSource, /左侧添加|右侧添加|后续接入|先统一入口/);
  assert.match(tabSource, /在参训教师模块添加名单后/);
  assert.match(tabSource, /导出名单、签到、课程签到和任务汇报/);
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
  assert.match(tabSource, /title="提交省培请假申请"/);
  assert.match(tabSource, /aria-label="保存省培个人信息"/);
  assert.match(tabSource, /title="保存省培个人信息"/);
  assert.match(tabSource, /aria-label="复制省培账号通知消息"/);
  assert.match(tabSource, /title="复制省培账号通知消息"/);
  assert.match(tabSource, /aria-label=\{`将\$\{participant\.name\}标记为\$\{Workspace\.teacherTrainingAttendanceLabels\[status\]\}`\}/);
  assert.match(tabSource, /title=\{`将\$\{participant\.name\}标记为\$\{Workspace\.teacherTrainingAttendanceLabels\[status\]\}`\}/);
  assert.match(shellSource, /打开省培模块导航/);
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
    "附件说明或链接",
  ]) {
    assert.match(tabSource, new RegExp(`<span className=\\{teacherTrainingFieldLabelClassName\\}>${label}<\\/span>`));
  }
  assert.match(tabSource, /已按当前省培账号锁定/);
  assert.match(tabSource, /canManage \? \([\s\S]*选择省培汇报教师[\s\S]*\) : \([\s\S]*我的汇报身份/);
  assert.match(tabSource, /canManage \? "管理员可按班次导出全部任务完成情况。" : "查看我的任务提交记录和完成情况。"/);
  assert.match(tabSource, /teacherTaskActionHint/);
  assert.match(tabSource, /确认我的汇报身份/);
  assert.match(tabSource, /填写后保存汇报/);
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
    "选择班主任账号",
    "班主任职务",
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
    "报到登记日期",
    "报到登记场次",
    "省培任务名称",
    "省培任务说明",
    "省培任务截止日期",
    "省培任务附件要求",
  ]) {
    assert.match(tabSource, new RegExp(`<span className=\\{teacherTrainingFieldLabelClassName\\}>${label}<\\/span>`));
  }
});

test("teacher training leave approval panel keeps desktop review cards readable", () => {
  const tabSource = read("src/components/tabs/teacher-training-tab.tsx");

  assert.match(tabSource, /xl:grid-cols-\[minmax\(0,1fr\)_minmax\(430px,0\.78fr\)\]/);
  assert.match(tabSource, /rounded-2xl border border-slate-200\/70 bg-white px-4 py-4 shadow-sm/);
  assert.match(tabSource, /xl:grid-cols-\[minmax\(0,1fr\)_auto\]/);
  assert.match(tabSource, /flex shrink-0 flex-wrap justify-end gap-2/);
});
