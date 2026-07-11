import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  mergeTeacherTrainingParticipantExtraInfo,
  parseTeacherTrainingParticipantExtraInfo,
} from "../src/lib/teacher-training";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

// 复刻组长指定接口（random-groups PUT）对同组成员的写入逻辑：
// 每个成员 isGroupLeader = 成员是否为所选组长，从而保证一组内至多一名组长。
type Member = { id: string; extraInfo: string };
const assignGroupLeader = (members: Member[], leaderId: string): Member[] =>
  members.map((member) => ({
    id: member.id,
    extraInfo: mergeTeacherTrainingParticipantExtraInfo(member.extraInfo, {
      isGroupLeader: member.id === leaderId,
    }),
  }));

const leaders = (members: Member[]) =>
  members.filter((member) => parseTeacherTrainingParticipantExtraInfo(member.extraInfo).isGroupLeader);

test("组长身份可写入并解析扩展信息", () => {
  const extra = mergeTeacherTrainingParticipantExtraInfo("职务：教研员", { isGroupLeader: true });
  const parsed = parseTeacherTrainingParticipantExtraInfo(extra);
  assert.equal(parsed.isGroupLeader, true);
  // 其他字段不受影响
  assert.equal(parsed.title, "教研员");

  const cleared = mergeTeacherTrainingParticipantExtraInfo(extra, { isGroupLeader: false });
  assert.equal(parseTeacherTrainingParticipantExtraInfo(cleared).isGroupLeader, false);
  assert.equal(parseTeacherTrainingParticipantExtraInfo(cleared).title, "教研员");
});

test("每组只能有一名组长", () => {
  const members: Member[] = [
    { id: "a", extraInfo: "" },
    { id: "b", extraInfo: "" },
    { id: "c", extraInfo: "" },
  ];
  const assigned = assignGroupLeader(members, "b");
  const current = leaders(assigned);
  assert.equal(current.length, 1);
  assert.equal(current[0].id, "b");
});

test("更换组长后旧组长立即失去组长身份", () => {
  let members: Member[] = [
    { id: "a", extraInfo: "" },
    { id: "b", extraInfo: "" },
  ];
  members = assignGroupLeader(members, "a");
  assert.deepEqual(leaders(members).map((m) => m.id), ["a"]);

  // 更换为 b，旧组长 a 应被清除，只保留 b。
  members = assignGroupLeader(members, "b");
  const after = leaders(members);
  assert.equal(after.length, 1);
  assert.equal(after[0].id, "b");
  assert.equal(parseTeacherTrainingParticipantExtraInfo(members[0].extraInfo).isGroupLeader, false);
});

test("随机重新分组保存时会清空旧组长标记", () => {
  const groupRoute = read("src/app/api/teacher-training/participants/random-groups/route.ts");
  // PATCH（保存随机分组）需在写入分组名的同时清除 isGroupLeader。
  assert.match(groupRoute, /isGroupLeader:\s*false/);
  assert.match(groupRoute, /mergeTeacherTrainingParticipantExtraInfo/);
  // PUT（指定组长）以 member.id === leaderId 写入，保证组内唯一。
  assert.match(groupRoute, /isGroupLeader:\s*member\.id === leaderId/);
});

test("小组任务上传地址仅向本组组长签发", () => {
  const uploadRoute = read("src/app/api/teacher-training/submissions/upload-url/route.ts");
  assert.match(uploadRoute, /task\.taskType === "group"/);
  assert.match(uploadRoute, /parseTeacherTrainingParticipantExtraInfo\(participant\.extraInfo\)\.isGroupLeader/);
  assert.match(uploadRoute, /status:\s*403/);
});

test("普通组员无法提交小组任务，组长可提交", () => {
  const submissionRoute = read("src/app/api/teacher-training/submissions/route.ts");
  assert.match(submissionRoute, /task\.taskType === "group"/);
  assert.match(submissionRoute, /parseTeacherTrainingParticipantExtraInfo\(participant\.extraInfo\)\.isGroupLeader/);
  assert.match(submissionRoute, /status:\s*403/);
  // 后端校验，不只依赖前端隐藏。
  assert.match(submissionRoute, /accountUserId:\s*user\.id/);
});

test("同一组每项小组任务只保留一份有效提交", () => {
  const submissionRoute = read("src/app/api/teacher-training/submissions/route.ts");
  assert.match(submissionRoute, /groupParticipantIds/);
  // upsert 到组内已有提交对应的参训教师，避免同组多份。
  assert.match(submissionRoute, /existingSubmission\?\.participantId \?\? participantId/);
});

test("小组任务允许保存截止时间，不被清空", () => {
  const taskRoute = read("src/app/api/teacher-training/tasks/route.ts");
  // dueDate 无条件按输入写入，未对 group 类型做隐藏或清空处理。
  assert.match(taskRoute, /dueDate:\s*body\?\.dueDate\?\.trim\(\) \|\| null/);
  assert.doesNotMatch(taskRoute, /taskType === "group"[\s\S]{0,120}dueDate:\s*null/);
});

test("教师只能看到本组的小组任务提交", () => {
  const platformRoute = read("src/app/api/teacher-training/route.ts");
  assert.match(platformRoute, /groupParticipantIds/);
  assert.match(platformRoute, /task\.taskType === "group"[\s\S]{0,120}groupParticipantIds\.has\(submission\.participantId\)/);
});

test("普通教师不能通过个人资料自行修改分组", () => {
  const profileRoute = read("src/app/api/teacher-training/profile/route.ts");
  // 参训教师更新档案时不再写入 groupName，保留班主任安排的分组。
  assert.doesNotMatch(profileRoute, /data:\s*{[\s\S]{0,200}\bgroupName,/);
});

test("参训教师页面提供整合的分组管理与组长设置", () => {
  const tabSource = read("src/components/tabs/teacher-training-tab.tsx");
  assert.match(tabSource, /分组管理/);
  assert.match(tabSource, /现有分组与组长/);
  assert.match(tabSource, /saveExistingGroupLeader/);
  // 随机重分是危险操作，单独放置并提示覆盖。
  assert.match(tabSource, /随机重新分组/);
  assert.match(tabSource, /覆盖现有分组/);
});

test("教师端明显显示分组与组长身份，未分组显示暂未分组", () => {
  const tabSource = read("src/components/tabs/teacher-training-tab.tsx");
  assert.match(tabSource, /暂未分组/);
  assert.match(tabSource, /teacherOwnGroupLabel/);
  assert.match(tabSource, /teacherOwnIsGroupLeader/);
  // 普通组员小组任务界面显示"由本组组长提交"而非上传按钮。
  assert.match(tabSource, /由本组组长提交/);
  assert.match(tabSource, /teacherGroupTaskReadOnly/);
});

test("分组管理关键信息在手机端不横向溢出", () => {
  const tabSource = read("src/components/tabs/teacher-training-tab.tsx");
  // 组卡片使用 min-w-0 / truncate / flex-wrap，避免长单位名撑破布局。
  assert.match(tabSource, /min-w-0 truncate text-sm font-bold text-slate-950/);
  assert.match(tabSource, /flex flex-wrap items-center gap-2/);
});
