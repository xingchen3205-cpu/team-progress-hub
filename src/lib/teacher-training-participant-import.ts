export const teacherTrainingParticipantImportColumnAliases = {
  name: ["姓名", "参训教师", "参训教师姓名", "教师姓名", "学员姓名", "姓名（教师）", "姓名(教师)"],
  organization: [
    "单位",
    "单位名称",
    "所在单位",
    "工作单位",
    "学校",
    "学校名称",
    "所在学校",
    "所属学校",
    "工作学校",
    "参训教师单位",
    "所在学校单位",
    "所在单位学校",
    "所在院校",
    "院校",
    "院校名称",
  ],
  phone: ["手机", "手机号", "手机号码", "联系电话", "电话"],
  gender: ["性别", "学员性别"],
  age: ["年龄", "学员年龄"],
  personnelCategory: ["人员类别", "人员类型", "教师类别", "学员类别"],
  subject: ["学科", "专业学科", "任教学科"],
  professionalTitle: ["职称", "专业技术职称", "教师职称"],
  groupName: ["分组", "组别", "小组"],
  title: ["职务", "职位", "个人职务", "参训教师职务"],
  city: ["所属市", "地市", "所在市", "城市"],
  email: ["邮箱", "电子邮箱", "邮件"],
  arrivalAt: ["预计到达时间", "到达时间", "预计报到时间", "预计报道时间", "报到时间", "报道时间"],
  arrivalTransportation: ["交通方式", "交通", "到达方式"],
  arrivalVehicleNo: ["车次/航班/车牌", "车次", "航班", "车牌", "班次"],
  arrivalDeparture: ["出发地", "出发城市"],
  extraInfo: ["扩展信息", "预录扩展信息", "其他信息"],
  note: ["备注", "名单备注", "参训教师备注"],
} as const;

export type TeacherTrainingParticipantImportColumn = keyof typeof teacherTrainingParticipantImportColumnAliases;

export type TeacherTrainingParticipantImportRow = Record<TeacherTrainingParticipantImportColumn, string>;

export const teacherTrainingParticipantImportColumnOrder: TeacherTrainingParticipantImportColumn[] = [
  "name",
  "organization",
  "phone",
  "gender",
  "age",
  "personnelCategory",
  "subject",
  "professionalTitle",
  "groupName",
  "title",
  "city",
  "email",
  "arrivalAt",
  "arrivalTransportation",
  "arrivalVehicleNo",
  "arrivalDeparture",
  "extraInfo",
  "note",
];

export const splitTeacherTrainingImportLine = (line: string) => {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (!quoted && (char === "\t" || char === "," || char === "，")) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  cells.push(current.trim());
  return cells;
};

const normalizeImportHeader = (value: string) =>
  value
    .replace(/^\uFEFF/, "")
    .trim()
    .replace(/[\s_*＊:：()（）/\\\-]/g, "")
    .toLocaleLowerCase("zh-CN");

export const resolveTeacherTrainingParticipantImportColumn = (
  header: string,
): TeacherTrainingParticipantImportColumn | null => {
  const normalizedHeader = normalizeImportHeader(header);
  for (const [key, aliases] of Object.entries(teacherTrainingParticipantImportColumnAliases)) {
    if (aliases.some((alias) => normalizeImportHeader(alias) === normalizedHeader)) {
      return key as TeacherTrainingParticipantImportColumn;
    }
  }

  return null;
};

const createEmptyParticipantImportRow = (): TeacherTrainingParticipantImportRow =>
  Object.fromEntries(teacherTrainingParticipantImportColumnOrder.map((key) => [key, ""])) as TeacherTrainingParticipantImportRow;

const isMeaningfulImportRow = (row: TeacherTrainingParticipantImportRow) =>
  Object.values(row).some((value) => value.trim());

const resolveHeaderColumns = (row: string[]) => row.map(resolveTeacherTrainingParticipantImportColumn);

const findParticipantHeaderRowIndex = (rows: string[][]) =>
  rows.findIndex((row) => {
    const columns = resolveHeaderColumns(row);
    return columns.includes("name") && columns.includes("organization");
  });

export const parseTeacherTrainingParticipantImportText = (text: string): TeacherTrainingParticipantImportRow[] => {
  const rows = text
    .split(/\r?\n/)
    .map((line) => splitTeacherTrainingImportLine(line))
    .filter((parts) => parts.some((part) => part.trim()));
  if (rows.length === 0) return [];

  const headerRowIndex = findParticipantHeaderRowIndex(rows);
  const hasHeader = headerRowIndex >= 0;
  const headerColumns = hasHeader ? resolveHeaderColumns(rows[headerRowIndex]) : [];
  const dataRows = hasHeader ? rows.slice(headerRowIndex + 1) : rows;

  return dataRows
    .map((parts) => {
      const participant = createEmptyParticipantImportRow();
      parts.forEach((value, index) => {
        const key = hasHeader ? headerColumns[index] : teacherTrainingParticipantImportColumnOrder[index];
        if (key) {
          participant[key] = value;
        }
      });
      return participant;
    })
    .filter(isMeaningfulImportRow);
};
