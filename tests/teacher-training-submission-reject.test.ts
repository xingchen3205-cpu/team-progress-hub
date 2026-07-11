import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

const rejectRoute = () => read("src/app/api/teacher-training/submissions/[submissionId]/reject/route.ts");
const submissionRoute = () => read("src/app/api/teacher-training/submissions/route.ts");
const uploadRoute = () => read("src/app/api/teacher-training/submissions/upload-url/route.ts");
const tasksRoute = () => read("src/app/api/teacher-training/tasks/route.ts");
const reviewRoute = () => read("src/app/api/teacher-training/submissions/[submissionId]/review/route.ts");
const aiReviewRoute = () => read("src/app/api/teacher-training/tasks/[taskId]/ai-review/route.ts");
const platformRoute = () => read("src/app/api/teacher-training/route.ts");
const trainingLib = () => read("src/lib/teacher-training.ts");
const tab = () => read("src/components/tabs/teacher-training-tab.tsx");

test("驳回接口存在，复用 status 与现有字段记录驳回轨迹", () => {
  const route = rejectRoute();
  assert.match(route, /status:\s*"rejected"/);
  assert.match(route, /finalComment:\s*reason/);
  assert.match(route, /finalReviewedById:\s*user\.id/);
  assert.match(route, /finalReviewedAt:\s*rejectedAt/);
  // 不删除任务、提交或附件（仅改状态）。
  assert.doesNotMatch(route, /prisma\.teacherTrainingSubmission\.delete/);
  assert.doesNotMatch(route, /deleteStoredFile/);
});

test("驳回原因必填且受管理权限保护，不跨班次、不重复驳回", () => {
  const route = rejectRoute();
  assert.match(route, /reason\.length < 2/);
  assert.match(route, /请填写驳回原因/);
  assert.match(route, /hasTeacherTrainingCohortManageAccess\(user, submission\.task\.cohortId\)/);
  assert.match(route, /submission\.status === "rejected"[\s\S]{0,120}409/);
});

test("驳回写入系统操作日志（审计）", () => {
  const route = rejectRoute();
  assert.match(route, /createAuditLogEntry/);
  assert.match(route, /teacher_training_submission\.rejected/);
});

test("驳回生成站内通知，只发原提交人与当前组长，邮件失败不回滚", () => {
  const route = rejectRoute();
  assert.match(route, /createNotifications/);
  assert.match(route, /任务汇报被驳回/);
  assert.match(route, /type:\s*"teacher_training_submission_rejected"/);
  assert.match(route, /targetTab:\s*"teacherTraining"/);
  assert.match(route, /relatedId:\s*submission\.task\.id/);
  // 组长纳入通知对象。
  assert.match(route, /isGroupLeader/);
  // 邮件/通知失败仅记录日志，不影响驳回结果。
  assert.match(route, /catch\s*\(error\)[\s\S]{0,120}console\.error/);
});

test("截止后后端拒绝新增提交与替换附件，rejected 记录例外", () => {
  const submission = submissionRoute();
  assert.match(submission, /isTeacherTrainingTaskPastDue\(task\.dueDate\)/);
  assert.match(submission, /任务已截止，无法提交或替换附件。/);
  assert.match(submission, /dueExisting\.status !== "rejected"/);
  const upload = uploadRoute();
  assert.match(upload, /isTeacherTrainingTaskPastDue\(task\.dueDate\)/);
  assert.match(upload, /任务已截止，无法提交或替换附件。/);
  assert.match(upload, /dueExisting\.status !== "rejected"/);
});

test("重新提交恢复 submitted 并清空旧评分/驳回信息", () => {
  const submission = submissionRoute();
  assert.match(submission, /status:\s*"submitted"/);
  assert.match(submission, /finalScore:\s*null/);
  assert.match(submission, /finalComment:\s*null/);
  assert.match(submission, /aiScore:\s*null/);
});

test("驳回记录不会继续进入人工评分或 AI 评分", () => {
  assert.match(reviewRoute(), /submission\.status === "rejected"[\s\S]{0,180}409/);
  assert.match(aiReviewRoute(), /submission\.status !== "rejected"/);
  assert.match(aiReviewRoute(), /requestedSubmission\?\.status === "rejected"[\s\S]{0,180}409/);
  assert.match(tab(), /canManage && !submission\.isRejected/);
  assert.match(trainingLib(), /aiScore: submission\.status === "rejected" \? null/);
});

test("普通教师班次数据始终经过隐私过滤，并由后端提供本组组长状态", () => {
  const route = platformRoute();
  assert.doesNotMatch(route, /isParticipantOnly\s*\?\s*cohorts\s*:/);
  assert.match(route, /filterCohortForParticipantOnly\(cohort, user\.id, managedCohortIds\)/);
  assert.match(route, /currentParticipantGroupHasLeader/);
  assert.match(route, /parseTeacherTrainingParticipantExtraInfo\(participant\.extraInfo\)\.isGroupLeader/);
  assert.match(tab(), /selectedCohort\?\.currentParticipantGroupHasLeader/);
});

test("小组任务至少需要一个非空分组", () => {
  const route = tasksRoute();
  const nonEmptyGroupChecks = route.match(/groupName:\s*\{\s*not:\s*""\s*\}/g) ?? [];
  assert.equal(nonEmptyGroupChecks.length, 2);
});

test("发布/修改保存归一截止时间并校验晚于开放/课程结束", () => {
  const route = tasksRoute();
  assert.match(route, /normalizeTeacherTrainingDueDateForSave/);
  assert.match(route, /validateTeacherTrainingDueAgainstRelease/);
});

test("管理端小组任务按小组展示状态，不再套用全班名单", () => {
  const source = tab();
  assert.match(source, /canManage && task\.isGroupTask/);
  assert.match(source, /小组提交进度：/);
  assert.match(source, /未指定组长，暂不可提交/);
  assert.match(source, /待组长提交/);
  assert.match(source, /已截止，未提交/);
});

test("管理端提供驳回重交按钮与确认弹窗", () => {
  const source = tab();
  assert.match(source, /驳回重交/);
  assert.match(source, /openRejectSubmission/);
  assert.match(source, /驳回该份汇报？/);
  assert.match(source, /确认驳回/);
  assert.match(source, /仅退回本次汇报，不会删除任务/);
  // 任务级删除仍保留，用于删除整项任务。
  assert.match(source, /确认删除省培任务/);
});

test("管理端统计使用小组/份口径，不再写死 /份", () => {
  const source = tab();
  assert.match(source, /task\.completionLabel/);
  assert.doesNotMatch(source, /task\.submissions\.length}\/\{selectedCohort\.participants\.length} 份/);
});

test("教师端只统计本人：全部/待提交/已提交/被驳回", () => {
  const source = tab();
  assert.match(source, /teacherAllTaskCount/);
  assert.match(source, /teacherRejectedTaskCount/);
  assert.match(source, /teacherPendingTaskCount = !canManage \? teacherReleasedTasks\.length - teacherSubmittedTaskCount/);
  // 待提交不再用全班人数相减。
  assert.doesNotMatch(source, /participants\.length - .*teacherSubmittedTaskCount/);
});

test("教师端按本人/本组状态展示，不显示全班 25/60份", () => {
  const source = tab();
  assert.match(source, /getTeacherTaskPersonalState/);
  assert.match(source, /本组已提交/);
  assert.match(source, /已驳回，待重新提交/);
  assert.match(source, /本组未指定组长/);
  // 教师接口只返回本人及本组提交，小组任务取本组那条提交。
  assert.match(source, /if \(task\.isGroupTask\) \{[\s\S]{0,120}task\.submissions\[0\] \?\? null/);
});

test("教师端展示完整任务说明（保留换行）并在其后显示操作", () => {
  const source = tab();
  // 任务信息块使用 whitespace-pre-wrap 展示完整说明。
  assert.match(source, /!canManage && selectedTask \? \(\(\) => \{[\s\S]{0,1600}whitespace-pre-wrap/);
  assert.match(source, /关联课程：/);
  assert.match(source, /附件要求：需上传 Word 或 PDF 附件/);
});

test("驳回后教师端显示驳回原因与重新提交入口", () => {
  const source = tab();
  assert.match(source, /汇报已驳回，请重新提交/);
  assert.match(source, /重新提交/);
  assert.match(source, /rejectionReason/);
});

test("点击驳回通知会标记已读并定位到对应任务", () => {
  const context = read("src/components/workspace-context.tsx");
  // openNotification 先标记已读，再进入省培任务页并记录待定位任务。
  assert.match(context, /const openNotification[\s\S]{0,200}markNotificationAsRead/);
  assert.match(context, /notification\.targetTab === "teacherTraining" && notification\.relatedId/);
  assert.match(context, /setTeacherTrainingFocusTaskId\(notification\.relatedId\)/);
  const source = tab();
  // 省培任务页消费该 id，切到任务页并聚焦对应任务后清除。
  assert.match(source, /teacherTrainingFocusTaskId/);
  assert.match(source, /focusTeacherTaskSubmission\(teacherTrainingFocusTaskId\)/);
  assert.match(source, /setTeacherTrainingFocusTaskId\(""\)/);
});
