import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  buildTeacherTrainingGroupExportFileName,
  buildTeacherTrainingGroupExportRows,
  buildTeacherTrainingGroupWorkbook,
  buildTeacherTrainingParticipantGroups,
  parseTeacherTrainingGroupOrder,
  sortTeacherTrainingGroupNames,
  type TeacherTrainingCohortItem,
  type TeacherTrainingParticipantItem,
} from "../src/lib/teacher-training";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

const makeParticipant = (
  overrides: Partial<TeacherTrainingParticipantItem> & { id: string; name: string },
): TeacherTrainingParticipantItem => ({
  cohortId: "cohort-1",
  organization: "某某学校",
  phone: "13800000000",
  groupName: "",
  isGroupLeader: false,
  title: "",
  email: "",
  gender: "",
  age: "",
  personnelCategory: "",
  subject: "",
  professionalTitle: "",
  city: "",
  arrivalInfo: {
    transportation: "",
    transportationLabel: "",
    arrivalAt: "",
    vehicleNo: "",
    departure: "",
    companions: "",
    lodging: "",
    note: "",
    isSubmitted: false,
  },
  arrivalAt: "",
  arrivalTransportationLabel: "",
  accountUserId: null,
  accountName: "",
  accountUsername: "",
  accountRole: "",
  extraInfo: "",
  extraInfoLines: [],
  note: "",
  attendances: [],
  checkInRecords: [],
  leaveRequests: [],
  ...overrides,
});

test("分组自然排序：1、6、4、2 输出为 1、2、4、6", () => {
  const sorted = sortTeacherTrainingGroupNames(["第1组", "第6组", "第4组", "第2组"]);
  assert.deepEqual(sorted, ["第1组", "第2组", "第4组", "第6组"]);
});

test("分组自然排序：1、10、2 输出为 1、2、10（不是 1、10、2）", () => {
  const sorted = sortTeacherTrainingGroupNames(["第1组", "第10组", "第2组"]);
  assert.deepEqual(sorted, ["第1组", "第2组", "第10组"]);
});

test("分组自然排序兼容中文与字母组名", () => {
  assert.equal(parseTeacherTrainingGroupOrder("一组"), 1);
  assert.equal(parseTeacherTrainingGroupOrder("第十组"), 10);
  assert.equal(parseTeacherTrainingGroupOrder("二十一组"), 21);
  assert.equal(parseTeacherTrainingGroupOrder("A组"), null);
  // 数字组排在字母/自定义组前面，字母组按 zh-CN 本地化排序
  const sorted = sortTeacherTrainingGroupNames(["B组", "第2组", "A组", "第1组"]);
  assert.deepEqual(sorted, ["第1组", "第2组", "A组", "B组"]);
});

test("每组组长始终排在第一位，其余成员保持稳定顺序", () => {
  const participants = [
    makeParticipant({ id: "a", name: "张三", groupName: "第1组" }),
    makeParticipant({ id: "b", name: "李四", groupName: "第1组", isGroupLeader: true }),
    makeParticipant({ id: "c", name: "王五", groupName: "第1组" }),
  ];
  const groups = buildTeacherTrainingParticipantGroups(participants);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].members.map((m) => m.name), ["李四", "张三", "王五"]);
});

test("未指定组长时不错误置顶普通成员，保持原顺序", () => {
  const participants = [
    makeParticipant({ id: "a", name: "张三", groupName: "第1组" }),
    makeParticipant({ id: "b", name: "李四", groupName: "第1组" }),
  ];
  const groups = buildTeacherTrainingParticipantGroups(participants);
  assert.deepEqual(groups[0].members.map((m) => m.name), ["张三", "李四"]);
});

test("更换组长后新组长置顶，原组长回到稳定顺序", () => {
  const base = [
    makeParticipant({ id: "a", name: "张三", groupName: "第1组", isGroupLeader: true }),
    makeParticipant({ id: "b", name: "李四", groupName: "第1组" }),
    makeParticipant({ id: "c", name: "王五", groupName: "第1组" }),
  ];
  assert.deepEqual(buildTeacherTrainingParticipantGroups(base)[0].members.map((m) => m.name), [
    "张三",
    "李四",
    "王五",
  ]);
  // 组长改为王五
  const changed = base.map((m) => ({ ...m, isGroupLeader: m.id === "c" }));
  assert.deepEqual(buildTeacherTrainingParticipantGroups(changed)[0].members.map((m) => m.name), [
    "王五",
    "张三",
    "李四",
  ]);
});

test("一组不能存在两名组长时，导出身份仍以真实标记为准", () => {
  const participants = [
    makeParticipant({ id: "a", name: "张三", groupName: "第1组", isGroupLeader: true }),
    makeParticipant({ id: "b", name: "李四", groupName: "第1组" }),
  ];
  const groups = buildTeacherTrainingParticipantGroups(participants);
  const leaderCount = groups[0].members.filter((m) => m.isGroupLeader).length;
  assert.equal(leaderCount, 1);
});

const buildCohort = (): TeacherTrainingCohortItem =>
  ({
    id: "cohort-1",
    title: "2026省培一班",
    location: "",
    startDate: "2026-07-01",
    endDate: "2026-07-10",
    description: "",
    createdAt: "",
    createdByName: "",
    courseSessions: [],
    participants: [
      makeParticipant({ id: "a", name: "张三", groupName: "第2组", organization: "南京学校" }),
      makeParticipant({
        id: "b",
        name: "李四",
        groupName: "第10组",
        isGroupLeader: true,
        phone: "13900000001",
        accountUserId: "u-b",
        accountUsername: "13900000001",
      }),
      makeParticipant({ id: "c", name: "王五", groupName: "第1组", isGroupLeader: true }),
      makeParticipant({ id: "d", name: "赵六", groupName: "第1组" }),
      makeParticipant({ id: "e", name: "钱七", groupName: "" }),
    ],
    attendances: [],
    checkInTasks: [],
    leaveFlow: null,
    leaveRequests: [],
    managers: [],
    tasks: [],
    stats: {
      participantCount: 5,
      presentCount: 0,
      leaveCount: 0,
      absentCount: 0,
      courseCount: 0,
      checkInTaskCount: 0,
      checkInRecordCount: 0,
      leaveRequestCount: 0,
      managerCount: 0,
      taskCount: 0,
      submissionCount: 0,
    },
  }) as TeacherTrainingCohortItem;

test("导出顺序与页面一致：自然排序、组长第一、未分组最后", () => {
  const rows = buildTeacherTrainingGroupExportRows(buildCohort());
  // 列顺序：序号, 分组, 组内序号, 身份, 姓名, ...
  const readable = rows.map((row) => [row[1].value, row[3].value, row[4].value]);
  assert.deepEqual(readable, [
    ["第1组", "组长", "王五"],
    ["第1组", "组员", "赵六"],
    ["第2组", "组员", "张三"],
    ["第10组", "组长", "李四"],
    ["未分组", "组员", "钱七"],
  ]);
  // 序号连续、组内序号每组从 1 开始
  assert.deepEqual(rows.map((row) => row[0].value), [1, 2, 3, 4, 5]);
  assert.deepEqual(rows.map((row) => row[2].value), [1, 2, 1, 1, 1]);
});

test("导出手机号与登录账号按文本导出，不会变成科学计数法", () => {
  const workbook = buildTeacherTrainingGroupWorkbook(buildCohort());
  // createZipArchive 使用存储（stored）方式，缓冲区内可直接读到工作表 XML。
  const xml = workbook.toString("utf8");
  assert.match(xml, /PK/); // 是一个 zip/xlsx 包
  // 手机号以 inlineStr 文本形式出现，而不是数值 <v>13900000001</v>
  assert.match(xml, /t="inlineStr"><is><t[^>]*>13900000001<\/t>/);
  assert.doesNotMatch(xml, /<v>13900000001<\/v>/);
  // 表头冻结首行
  assert.match(xml, /state="frozen"/);
});

test("导出文件名包含班次名称、分组表和日期", () => {
  const fileName = buildTeacherTrainingGroupExportFileName("2026省培一班", new Date("2026-07-11T02:00:00.000Z"));
  assert.equal(fileName, "2026省培一班-参训教师分组表-20260711.xlsx");
});

test("导出不含密码等敏感字段", () => {
  const workbook = buildTeacherTrainingGroupWorkbook(buildCohort());
  const xml = workbook.toString("utf8");
  assert.doesNotMatch(xml, /密码|password/i);
});

test("未保存随机预览不能被当成正式分组导出", () => {
  const tabSource = read("src/components/tabs/teacher-training-tab.tsx");
  // 导出前若存在未保存的随机预览，提示先保存再导出。
  assert.match(tabSource, /randomGroupPreview\.length > 0[\s\S]{0,120}请先保存分组后再导出。/);
  // 导出走已保存分组的 groups 类型。
  assert.match(tabSource, /downloadTeacherTrainingExport\("groups"/);
});

test("分组导出接口受管理权限保护，普通教师无法导出", () => {
  const exportRoute = read("src/app/api/teacher-training/export/route.ts");
  assert.match(exportRoute, /hasTeacherTrainingCohortManageAccess/);
  assert.match(exportRoute, /type === "groups"/);
  assert.match(exportRoute, /buildTeacherTrainingGroupWorkbook/);
});

test("普通教师无法调用管理端的组长设置接口", () => {
  const groupRoute = read("src/app/api/teacher-training/participants/random-groups/route.ts");
  // PUT（指定组长）必须校验班次管理权限。
  assert.match(groupRoute, /export async function PUT[\s\S]{0,600}hasTeacherTrainingCohortManageAccess/);
  assert.match(groupRoute, /无权限设置该班次组长/);
});

test("分组卡片组长置顶并使用克制的蓝色高亮，手机端可换行", () => {
  const tabSource = read("src/components/tabs/teacher-training-tab.tsx");
  // 组长行使用浅蓝背景/蓝色边框和蓝色组长徽标。
  assert.match(tabSource, /border border-blue-200 bg-blue-50/);
  assert.match(tabSource, /bg-blue-100 px-2 py-0.5 text-\[11px\] font-bold text-blue-700/);
  // 未指定组长时显式提示。
  assert.match(tabSource, /未指定组长/);
  // 使用 break-words 允许姓名和单位换行，避免横向溢出。
  assert.match(tabSource, /break-words text-xs text-slate-500/);
  // 分组卡片按行排列（grid），不使用会造成纵向填充的 CSS columns。
  assert.match(tabSource, /grid gap-3 md:grid-cols-2 xl:grid-cols-3/);
  assert.doesNotMatch(tabSource, /columns-2|columns-3/);
});
