import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  compareTeacherTrainingCheckInTasks,
  parseTeacherTrainingImportNoteMeta,
  sortTeacherTrainingCheckInTasks,
} from "../src/lib/teacher-training";
import {
  analyzeTencentCheckInImport,
  buildTeacherTrainingImportNote,
  normalizeTencentName,
  normalizeTencentPhone,
  normalizeTencentMeetingDateTime,
  parseDelimitedRows,
  parseTencentDurationMinutes,
  parseTencentMeetingRows,
} from "../src/lib/teacher-training-checkin-import";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

// ---------- 排序 ----------

test("同一天按开始时间 08:30、14:00、19:00 正序", () => {
  const tasks = [
    { id: "c", signDate: "2026-07-12", startTime: "19:00", createdAt: "3" },
    { id: "a", signDate: "2026-07-12", startTime: "08:30", createdAt: "1" },
    { id: "b", signDate: "2026-07-12", startTime: "14:00", createdAt: "2" },
  ];
  assert.deepEqual(
    sortTeacherTrainingCheckInTasks(tasks).map((task) => task.startTime),
    ["08:30", "14:00", "19:00"],
  );
});

test("不同日期按日期倒序（较新在前）", () => {
  const tasks = [
    { id: "old", signDate: "2026-07-11", startTime: "16:00" },
    { id: "new1", signDate: "2026-07-12", startTime: "08:30" },
    { id: "new2", signDate: "2026-07-12", startTime: "14:00" },
  ];
  assert.deepEqual(
    sortTeacherTrainingCheckInTasks(tasks).map((task) => `${task.signDate} ${task.startTime}`),
    ["2026-07-12 08:30", "2026-07-12 14:00", "2026-07-11 16:00"],
  );
});

test("缺少开始时间排在当天最后", () => {
  const tasks = [
    { id: "none", signDate: "2026-07-12", startTime: "" },
    { id: "morning", signDate: "2026-07-12", startTime: "08:30" },
  ];
  assert.deepEqual(sortTeacherTrainingCheckInTasks(tasks).map((task) => task.id), ["morning", "none"]);
});

test("时间相同按 createdAt 稳定排序，刷新不乱序", () => {
  const tasks = [
    { id: "z", signDate: "2026-07-12", startTime: "09:00", endTime: "10:00", createdAt: "2026-07-01T02:00:00Z" },
    { id: "a", signDate: "2026-07-12", startTime: "09:00", endTime: "10:00", createdAt: "2026-07-01T01:00:00Z" },
  ];
  const first = sortTeacherTrainingCheckInTasks(tasks).map((task) => task.id);
  const second = sortTeacherTrainingCheckInTasks([...tasks].reverse()).map((task) => task.id);
  assert.deepEqual(first, ["a", "z"]);
  assert.deepEqual(first, second);
});

test("排序不修改原数组（复制后排序）", () => {
  const tasks = [
    { id: "b", signDate: "2026-07-12", startTime: "14:00" },
    { id: "a", signDate: "2026-07-12", startTime: "08:30" },
  ];
  const snapshot = tasks.map((task) => task.id);
  sortTeacherTrainingCheckInTasks(tasks);
  assert.deepEqual(tasks.map((task) => task.id), snapshot);
});

test("compare 是纯函数，单独可用", () => {
  assert.ok(
    compareTeacherTrainingCheckInTasks(
      { signDate: "2026-07-12", startTime: "08:30" },
      { signDate: "2026-07-12", startTime: "14:00" },
    ) < 0,
  );
});

// ---------- 名称/手机号规范化 ----------

test("姓名规范化去除首尾/全角/连续空格与角色后缀", () => {
  assert.equal(normalizeTencentName("　张三　"), "张三");
  assert.equal(normalizeTencentName("张三(主持人)"), "张三");
  assert.equal(normalizeTencentName("张三（嘉宾）"), "张三");
  assert.equal(normalizeTencentName("张  三"), "张 三");
});

test("手机号规范化仅保留有效 11 位号码", () => {
  assert.equal(normalizeTencentPhone("138-0000-0000"), "13800000000");
  assert.equal(normalizeTencentPhone("+8613900000001"), "13900000001");
  assert.equal(normalizeTencentPhone("12345"), "");
});

test("参会时长解析为分钟", () => {
  assert.equal(parseTencentDurationMinutes("1小时20分"), 80);
  assert.equal(parseTencentDurationMinutes("80分钟"), 80);
  assert.equal(parseTencentDurationMinutes("01:20:00"), 80);
  assert.equal(parseTencentDurationMinutes("90"), 90);
  assert.equal(parseTencentDurationMinutes("0.5"), 720);
});

test("Excel 数值日期可转换为会议时间", () => {
  assert.equal(normalizeTencentMeetingDateTime("25569.5"), "1970-01-01 12:00:00");
});

// ---------- 表头识别 / 合并 ----------

const meetingRows = [
  ["姓名", "手机号", "入会时间", "退会时间", "参会时长"],
  ["张三(主持人)", "13800000000", "2026-07-12 08:30:00", "2026-07-12 09:00:00", "30分钟"],
  ["张三", "13800000000", "2026-07-12 09:10:00", "2026-07-12 10:00:00", "50分钟"],
  ["李四", "13900000001", "2026-07-12 08:35:00", "2026-07-12 09:50:00", "75分钟"],
  ["王五", "", "2026-07-12 08:40:00", "2026-07-12 09:30:00", "50分钟"],
];

test("识别腾讯会议表头并合并多次入会为一人", () => {
  const parsed = parseTencentMeetingRows(meetingRows);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  // 张三两条记录合并为一人
  const zhangsan = parsed.attendees.find((item) => item.phone === "13800000000");
  assert.ok(zhangsan);
  assert.equal(zhangsan?.mergedCount, 2);
  assert.equal(zhangsan?.durationMinutes, 80);
  assert.equal(zhangsan?.joinTime, "2026-07-12 08:30:00"); // 最早入会
  assert.equal(zhangsan?.leaveTime, "2026-07-12 10:00:00"); // 最晚离会
  assert.equal(parsed.attendees.length, 3); // 张三/李四/王五
  assert.equal(parsed.dataRowCount, 4);
});

test("无法识别表头时返回明确错误", () => {
  const parsed = parseTencentMeetingRows([["无关列", "数据"], ["a", "b"]]);
  assert.equal(parsed.ok, false);
  if (!parsed.ok) assert.match(parsed.error, /表头/);
});

test("CSV 文本可解析为行列", () => {
  const rows = parseDelimitedRows('姓名,手机号\n"张三",13800000000\n李四,13900000001');
  assert.deepEqual(rows[0], ["姓名", "手机号"]);
  assert.deepEqual(rows[1], ["张三", "13800000000"]);
});

// ---------- 匹配 ----------

const participants = [
  { id: "p1", name: "张三", phone: "13800000000", organization: "南京学校" },
  { id: "p2", name: "李四", phone: "13900000001", organization: "苏州学校" },
  { id: "p3", name: "王五", phone: "13700000002", organization: "无锡学校" },
  { id: "p4", name: "王五", phone: "13700000003", organization: "常州学校" },
];

test("手机号优先匹配、姓名匹配，未匹配不新增，重复导入幂等", () => {
  const parsed = parseTencentMeetingRows(meetingRows);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  // 王五（无手机号）会与两个同名教师冲突
  const analysis = analyzeTencentCheckInImport(parsed.attendees, participants, [], parsed.dataRowCount);
  // 张三手机号匹配、李四手机号匹配 => 2 可导入；王五同名冲突
  assert.equal(analysis.stats.importableCount, 2);
  assert.equal(analysis.stats.conflictCount, 1);
  assert.equal(analysis.stats.unmatchedCount, 0);
  assert.equal(analysis.stats.mergedCount, 1); // 张三合并 1 次
  assert.deepEqual(
    analysis.importable.map((match) => match.participantName).sort(),
    ["张三", "李四"].sort(),
  );
});

test("同名教师标记冲突，不自动猜测", () => {
  const parsed = parseTencentMeetingRows([
    ["姓名"],
    ["王五"],
  ]);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const analysis = analyzeTencentCheckInImport(parsed.attendees, participants, [], parsed.dataRowCount);
  assert.equal(analysis.stats.conflictCount, 1);
  assert.equal(analysis.stats.importableCount, 0);
  assert.equal(analysis.conflicts[0].candidates.length, 2);
});

test("已签到教师跳过，不重复计入可导入", () => {
  const parsed = parseTencentMeetingRows(meetingRows);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  // 张三已存在签到记录 => 跳过
  const analysis = analyzeTencentCheckInImport(parsed.attendees, participants, ["p1"], parsed.dataRowCount);
  assert.equal(analysis.stats.alreadySignedCount, 1);
  assert.equal(analysis.stats.importableCount, 1); // 只剩李四
  assert.ok(analysis.importable.every((match) => match.participantId !== "p1"));
});

test("导入备注保留文件名、导入人、导入时间且可解析出入会/离会/时长", () => {
  const note = buildTeacherTrainingImportNote({
    fileName: "会议名单.xlsx",
    operatorName: "王老师",
    importedAt: "2026-07-12 10:05",
    attendee: {
      name: "张三",
      rawName: "张三",
      phone: "13800000000",
      joinTime: "2026-07-12 08:30:00",
      leaveTime: "2026-07-12 10:00:00",
      durationMinutes: 80,
      mergedCount: 2,
    },
  });
  assert.match(note, /线上名单导入/);
  assert.match(note, /会议名单\.xlsx/);
  assert.match(note, /王老师/);
  const meta = parseTeacherTrainingImportNoteMeta(note);
  assert.equal(meta.joinTime, "2026-07-12 08:30:00");
  assert.equal(meta.leaveTime, "2026-07-12 10:00:00");
  assert.equal(meta.durationLabel, "80 分钟");
});

// ---------- 后端/前端源码保障 ----------

test("导入接口重新校验班次管理权限，普通教师无法调用", () => {
  const previewRoute = read("src/app/api/teacher-training/check-ins/import-preview/route.ts");
  const importRoute = read("src/app/api/teacher-training/check-ins/import/route.ts");
  assert.match(previewRoute, /hasTeacherTrainingCohortManageAccess/);
  assert.match(importRoute, /hasTeacherTrainingCohortManageAccess/);
  assert.match(previewRoute, /无权限导入该省培班次签到名单/);
});

test("导入写入用事务，来源标为 imported，不覆盖已有记录", () => {
  const importRoute = read("src/app/api/teacher-training/check-ins/import/route.ts");
  assert.match(importRoute, /prisma\.\$transaction/);
  assert.match(importRoute, /status:\s*"imported"/);
  // 只对没有记录的教师 createMany，保证不覆盖已有定位/补签/导入记录且重复导入幂等。
  assert.match(importRoute, /existingParticipantIds\.has\(participantId\)/);
  assert.match(importRoute, /createMany/);
  assert.doesNotMatch(importRoute, /teacherTrainingCheckInRecord\.update\b/);
  assert.doesNotMatch(importRoute, /teacherTrainingCheckInRecord\.delete/);
});

test("纯线上名单签到使用明确标记，既有无坐标签到仍可定位", () => {
  const importRoute = read("src/app/api/teacher-training/check-ins/import/route.ts");
  assert.match(importRoute, /latitude:\s*null/);
  assert.match(importRoute, /TEACHER_TRAINING_IMPORT_ONLY_LOCATION_MARKER/);
  assert.doesNotMatch(importRoute, /isActive:\s*false/);
  const tab = read("src/components/tabs/teacher-training-tab.tsx");
  assert.match(tab, /filter\(\(task\) => !task\.isImportOnly\)/);
  assert.doesNotMatch(tab, /const hasLocation = task\.latitude !== null && task\.longitude !== null/);
  const signRoute = read("src/app/api/teacher-training/check-ins/sign/route.ts");
  assert.match(signRoute, /isTeacherTrainingImportOnlyCheckInTask/);
  const taskRoute = read("src/app/api/teacher-training/check-ins/route.ts");
  assert.match(taskRoute, /isTeacherTrainingImportOnlyCheckInTask/);
  assert.match(taskRoute, /TEACHER_TRAINING_IMPORT_ONLY_LOCATION_MARKER/);
});

test("没有可导入教师时后端不会创建空签到任务", () => {
  const importRoute = read("src/app/api/teacher-training/check-ins/import/route.ts");
  assert.match(importRoute, /importByParticipant\.size === 0/);
  assert.match(importRoute, /没有可导入的教师/);
});

test("导出增加签到来源/入会/离会/参会时长列", () => {
  const lib = read("src/lib/teacher-training.ts");
  assert.match(lib, /"签到来源"/);
  assert.match(lib, /"入会时间"/);
  assert.match(lib, /"离会时间"/);
  assert.match(lib, /"参会时长"/);
});

test("管理端提供导入入口与混合签到导入按钮，统计按来源展示", () => {
  const tab = read("src/components/tabs/teacher-training-tab.tsx");
  assert.match(tab, /导入线上签到名单/);
  assert.match(tab, /导入线上名单/);
  assert.match(tab, /线上导入 \{importedCount\} 人/);
  assert.match(tab, /previewTeacherTrainingCheckInImport/);
  assert.match(tab, /importTeacherTrainingCheckInList/);
});
