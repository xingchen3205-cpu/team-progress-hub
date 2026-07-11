import assert from "node:assert/strict";
import test from "node:test";

import {
  computeTeacherTrainingTaskCompletion,
  formatTeacherTrainingDueLabel,
  getTeacherTrainingTaskDueAt,
  getTeacherTrainingValidGroupNames,
  isTeacherTrainingSubmissionEffective,
  isTeacherTrainingTaskPastDue,
  normalizeTeacherTrainingDueDateForSave,
  toTeacherTrainingDueDateInputValue,
  validateTeacherTrainingDueAgainstRelease,
} from "../src/lib/teacher-training";

// 6 个小组、每组 10 人，共 60 名教师。
const buildParticipants = (options?: { ungrouped?: number }) => {
  const participants: Array<{ id: string; groupName: string }> = [];
  for (let groupIndex = 1; groupIndex <= 6; groupIndex += 1) {
    for (let member = 0; member < 10; member += 1) {
      participants.push({ id: `g${groupIndex}-m${member}`, groupName: `第${groupIndex}组` });
    }
  }
  for (let index = 0; index < (options?.ungrouped ?? 0); index += 1) {
    participants.push({ id: `u${index}`, groupName: "" });
  }
  return participants;
};

test("小组任务初始显示 0/6组", () => {
  const completion = computeTeacherTrainingTaskCompletion(
    { taskType: "group", submissions: [] },
    buildParticipants(),
  );
  assert.equal(completion.label, "0/6组");
  assert.equal(completion.unit, "组");
});

test("一个小组提交后显示 1/6组", () => {
  const completion = computeTeacherTrainingTaskCompletion(
    { taskType: "group", submissions: [{ participantId: "g1-m0", status: "submitted" }] },
    buildParticipants(),
  );
  assert.equal(completion.label, "1/6组");
});

test("同组替换附件仍显示 1/6组", () => {
  // 同一组即使换了提交人，也只有一条有效提交，仍计为 1 组。
  const completion = computeTeacherTrainingTaskCompletion(
    { taskType: "group", submissions: [{ participantId: "g1-m3", status: "submitted" }] },
    buildParticipants(),
  );
  assert.equal(completion.label, "1/6组");
});

test("被驳回的小组提交不计入已提交小组数", () => {
  const completion = computeTeacherTrainingTaskCompletion(
    { taskType: "group", submissions: [{ participantId: "g1-m0", status: "rejected" }] },
    buildParticipants(),
  );
  assert.equal(completion.label, "0/6组");
});

test("普通任务仍显示 提交人数/60份", () => {
  const submissions = Array.from({ length: 25 }, (_, index) => ({
    participantId: `g1-m${index % 10}`,
    status: "submitted",
  }));
  const completion = computeTeacherTrainingTaskCompletion(
    { taskType: "cohort", submissions },
    buildParticipants(),
  );
  assert.equal(completion.total, 60);
  assert.equal(completion.unit, "份");
  assert.match(completion.label, /\/60份$/);
});

test("未分组教师不计入小组任务分母", () => {
  const completion = computeTeacherTrainingTaskCompletion(
    { taskType: "group", submissions: [] },
    buildParticipants({ ungrouped: 5 }),
  );
  assert.equal(completion.total, 6);
  assert.equal(getTeacherTrainingValidGroupNames(buildParticipants({ ungrouped: 5 })).length, 6);
});

test("没有分组时小组任务显示 0/0组，不显示 0/60份", () => {
  const ungroupedOnly = Array.from({ length: 60 }, (_, index) => ({ id: `u${index}`, groupName: "" }));
  const completion = computeTeacherTrainingTaskCompletion(
    { taskType: "group", submissions: [] },
    ungroupedOnly,
  );
  assert.equal(completion.label, "0/0组");
  assert.notEqual(completion.label, "0/60份");
});

test("被驳回的提交不算有效提交", () => {
  assert.equal(isTeacherTrainingSubmissionEffective({ status: "rejected" }), false);
  assert.equal(isTeacherTrainingSubmissionEffective({ status: "submitted" }), true);
  assert.equal(isTeacherTrainingSubmissionEffective({}), true);
});

test("旧的纯日期截止按当天 23:59（Asia/Shanghai）解释", () => {
  const dueAt = getTeacherTrainingTaskDueAt("2026-07-15");
  assert.ok(dueAt);
  // 2026-07-15 23:59 +08:00 == 2026-07-15T15:59:00Z
  assert.equal(dueAt?.toISOString(), "2026-07-15T15:59:00.000Z");
  // 当天 20:00（UTC 12:00）未过截止
  assert.equal(isTeacherTrainingTaskPastDue("2026-07-15", new Date("2026-07-15T12:00:00Z")), false);
  // 次日已过截止
  assert.equal(isTeacherTrainingTaskPastDue("2026-07-15", new Date("2026-07-16T00:00:00Z")), true);
});

test("datetime-local 回显：旧纯日期补 23:59，新值到分钟", () => {
  assert.equal(toTeacherTrainingDueDateInputValue("2026-07-15"), "2026-07-15T23:59");
  assert.equal(toTeacherTrainingDueDateInputValue("2026-07-15T11:00"), "2026-07-15T11:00");
  assert.equal(toTeacherTrainingDueDateInputValue(""), "");
});

test("保存归一：datetime-local 存到分钟，旧纯日期不改写", () => {
  assert.equal(normalizeTeacherTrainingDueDateForSave("2026-07-15T11:00"), "2026-07-15T11:00");
  assert.equal(normalizeTeacherTrainingDueDateForSave("2026-07-15"), "2026-07-15");
});

test("截止时间统一展示为 YYYY-MM-DD HH:mm", () => {
  assert.equal(formatTeacherTrainingDueLabel("2026-07-15T11:00"), "2026-07-15 11:00");
  assert.equal(formatTeacherTrainingDueLabel("2026-07-15"), "2026-07-15 23:59");
});

test("截止时间不得早于开放时间", () => {
  const error = validateTeacherTrainingDueAgainstRelease({
    dueDate: "2026-07-10T09:00",
    releaseMode: "scheduled",
    releaseAt: "2026-07-12T09:00",
  });
  assert.match(error, /开放时间/);
  const ok = validateTeacherTrainingDueAgainstRelease({
    dueDate: "2026-07-15T09:00",
    releaseMode: "scheduled",
    releaseAt: "2026-07-12T09:00",
  });
  assert.equal(ok, "");
});

test("截止时间不得早于课程结束时间", () => {
  const error = validateTeacherTrainingDueAgainstRelease({
    dueDate: "2026-07-12T09:00",
    releaseMode: "after_course",
    releaseAt: "",
    courseSession: { courseDate: "2026-07-12", startTime: "10:00", endTime: "12:00" },
  });
  assert.match(error, /课程结束时间/);
});
