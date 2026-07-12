// 腾讯会议签到名单解析与匹配（纯函数，便于测试）。
// 不新增参训教师、不覆盖已有签到；同名冲突不自动猜测，多次入会合并为一人。

export type TencentMeetingField = "name" | "phone" | "joinTime" | "leaveTime" | "duration";

const headerSynonyms: Record<TencentMeetingField, string[]> = {
  name: ["姓名", "成员名称", "参会人", "参会成员", "用户名称", "入会成员", "与会者", "昵称"],
  phone: ["手机号", "手机", "联系电话", "电话"],
  joinTime: ["首次入会时间", "入会时间", "加入时间", "进入时间"],
  leaveTime: ["最后离会时间", "退会时间", "离开时间", "退出时间", "离会时间"],
  duration: ["累计参会时长", "参会时长", "会议时长", "时长"],
};

// 腾讯会议常见角色后缀，如 张三(主持人)、李四（嘉宾）。
const roleSuffixPattern = /[（(]\s*(主持人|联席主持人|主讲人|嘉宾|成员|访客|观众|入会者)\s*[)）]\s*$/;

export const normalizeTencentName = (value?: string | null): string => {
  let name = (value ?? "")
    .replace(/　/g, " ") // 全角空格
    .trim()
    .replace(/\s+/g, " ");
  let previous: string;
  do {
    previous = name;
    name = name.replace(roleSuffixPattern, "").trim();
  } while (name !== previous);
  return name;
};

export const normalizeTencentPhone = (value?: string | null): string => {
  const digits = (value ?? "").replace(/\D/g, "");
  const trimmed = digits.length === 13 && digits.startsWith("86") ? digits.slice(2) : digits;
  return /^1[3-9]\d{9}$/.test(trimmed) ? trimmed : "";
};

export const parseTencentDurationMinutes = (value?: string | null): number => {
  const text = (value ?? "").trim();
  if (!text) return 0;
  const rawNumber = Number(text);
  if (Number.isFinite(rawNumber) && rawNumber > 0 && rawNumber < 1) {
    // Excel 将时长保存为一天的小数，例如 0.5 = 12 小时。
    return Math.round(rawNumber * 24 * 60);
  }
  const clock = text.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/);
  if (clock) {
    const first = Number(clock[1]);
    const second = Number(clock[2]);
    if (clock[3] !== undefined) {
      // HH:MM:SS
      return first * 60 + second + Math.round(Number(clock[3]) / 60);
    }
    // MM:SS
    return first + Math.round(second / 60);
  }
  let minutes = 0;
  const hours = text.match(/(\d+)\s*(?:小时|时)/);
  if (hours) minutes += Number(hours[1]) * 60;
  const mins = text.match(/(\d+)\s*(?:分钟|分)/);
  if (mins) minutes += Number(mins[1]);
  if (!hours && !mins) {
    const numeric = Number(text.replace(/[^\d.]/g, ""));
    if (Number.isFinite(numeric)) minutes += Math.round(numeric);
  }
  return minutes;
};

export const normalizeTencentMeetingDateTime = (value?: string | null): string => {
  const text = (value ?? "").trim();
  if (!text) return "";
  const serial = Number(text);
  if (!Number.isFinite(serial) || serial < 1 || serial > 2958465) return text;
  // Excel 1900 日期系统；1899-12-30 同时兼容其虚构的 1900-02-29。
  const date = new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000);
  if (Number.isNaN(date.getTime())) return text;
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${date.getUTCDate()}`.padStart(2, "0");
  const hours = `${date.getUTCHours()}`.padStart(2, "0");
  const minutes = `${date.getUTCMinutes()}`.padStart(2, "0");
  const seconds = `${date.getUTCSeconds()}`.padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

// 解析 CSV/TSV 文本为行列（支持双引号转义，按整体内容选择分隔符）。
export const parseDelimitedRows = (text: string): string[][] => {
  const cleaned = text.replace(/^﻿/, "");
  const useTab = cleaned.includes("\t") && cleaned.split("\t").length > cleaned.split(",").length;
  const delimiter = useTab ? "\t" : ",";
  const rows: string[][] = [];
  for (const rawLine of cleaned.split(/\r?\n/)) {
    if (!rawLine.trim()) continue;
    const cells: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let index = 0; index < rawLine.length; index += 1) {
      const char = rawLine[index];
      if (char === '"') {
        if (inQuotes && rawLine[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        cells.push(current);
        current = "";
      } else {
        current += char;
      }
    }
    cells.push(current);
    rows.push(cells.map((cell) => cell.trim()));
  }
  return rows;
};

export const detectTencentHeader = (
  rows: string[][],
): { headerRowIndex: number; columns: Partial<Record<TencentMeetingField, number>> } | null => {
  const limit = Math.min(rows.length, 15);
  for (let rowIndex = 0; rowIndex < limit; rowIndex += 1) {
    const row = (rows[rowIndex] ?? []).map((cell) => (cell ?? "").trim());
    const columns: Partial<Record<TencentMeetingField, number>> = {};
    row.forEach((cell, colIndex) => {
      if (!cell) return;
      (Object.keys(headerSynonyms) as TencentMeetingField[]).forEach((field) => {
        if (columns[field] !== undefined) return;
        if (headerSynonyms[field].some((synonym) => cell === synonym || cell.includes(synonym))) {
          columns[field] = colIndex;
        }
      });
    });
    if (columns.name !== undefined) {
      return { headerRowIndex: rowIndex, columns };
    }
  }
  return null;
};

export type TencentAttendee = {
  name: string;
  rawName: string;
  phone: string;
  joinTime: string;
  leaveTime: string;
  durationMinutes: number;
  mergedCount: number;
};

export type TencentMeetingParseResult =
  | { ok: true; attendees: TencentAttendee[]; dataRowCount: number }
  | { ok: false; error: string };

export const parseTencentMeetingRows = (rows: string[][]): TencentMeetingParseResult => {
  const header = detectTencentHeader(rows);
  if (!header) {
    return { ok: false, error: "无法识别腾讯会议名单表头，请确认文件包含姓名/成员名称等列。" };
  }
  const { headerRowIndex, columns } = header;
  const dataRows = rows.slice(headerRowIndex + 1).filter((row) => row.some(Boolean));
  const byKey = new Map<string, TencentAttendee>();
  let dataRowCount = 0;

  for (const row of dataRows) {
    const rawName = columns.name !== undefined ? row[columns.name] ?? "" : "";
    const name = normalizeTencentName(rawName);
    const phone = columns.phone !== undefined ? normalizeTencentPhone(row[columns.phone]) : "";
    if (!name && !phone) continue;
    dataRowCount += 1;
    const joinTime = columns.joinTime !== undefined ? normalizeTencentMeetingDateTime(row[columns.joinTime]) : "";
    const leaveTime = columns.leaveTime !== undefined ? normalizeTencentMeetingDateTime(row[columns.leaveTime]) : "";
    const durationMinutes = columns.duration !== undefined ? parseTencentDurationMinutes(row[columns.duration]) : 0;
    const key = phone ? `p:${phone}` : `n:${name}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.mergedCount += 1;
      existing.durationMinutes += durationMinutes;
      if (joinTime && (!existing.joinTime || joinTime < existing.joinTime)) existing.joinTime = joinTime;
      if (leaveTime && (!existing.leaveTime || leaveTime > existing.leaveTime)) existing.leaveTime = leaveTime;
      if (!existing.phone && phone) existing.phone = phone;
      if (!existing.name && name) existing.name = name;
    } else {
      byKey.set(key, { name, rawName, phone, joinTime, leaveTime, durationMinutes, mergedCount: 1 });
    }
  }

  return { ok: true, attendees: [...byKey.values()], dataRowCount };
};

export type CheckInImportParticipant = {
  id: string;
  name: string;
  phone: string | null;
  organization?: string | null;
};

export type CheckInImportMatch = {
  attendee: TencentAttendee;
  participantId: string;
  participantName: string;
  matchedBy: "phone" | "name";
};

export type CheckInImportConflict = {
  attendee: TencentAttendee;
  candidates: Array<{ id: string; name: string; organization: string }>;
};

export type CheckInImportStats = {
  totalRows: number;
  matchedCount: number;
  mergedCount: number;
  alreadySignedCount: number;
  unmatchedCount: number;
  conflictCount: number;
  importableCount: number;
};

export type CheckInImportAnalysis = {
  importable: CheckInImportMatch[];
  alreadySigned: CheckInImportMatch[];
  unmatched: TencentAttendee[];
  conflicts: CheckInImportConflict[];
  stats: CheckInImportStats;
};

export const analyzeTencentCheckInImport = (
  attendees: TencentAttendee[],
  participants: CheckInImportParticipant[],
  alreadySignedParticipantIds: Iterable<string>,
  dataRowCount: number,
): CheckInImportAnalysis => {
  const signedSet = new Set(alreadySignedParticipantIds);
  const byPhone = new Map<string, CheckInImportParticipant[]>();
  const byName = new Map<string, CheckInImportParticipant[]>();
  for (const participant of participants) {
    const phone = normalizeTencentPhone(participant.phone);
    if (phone) byPhone.set(phone, [...(byPhone.get(phone) ?? []), participant]);
    const name = normalizeTencentName(participant.name);
    if (name) byName.set(name, [...(byName.get(name) ?? []), participant]);
  }

  const importable: CheckInImportMatch[] = [];
  const alreadySigned: CheckInImportMatch[] = [];
  const unmatched: TencentAttendee[] = [];
  const conflicts: CheckInImportConflict[] = [];

  for (const attendee of attendees) {
    let matchedParticipant: CheckInImportParticipant | null = null;
    let matchedBy: "phone" | "name" = "phone";

    if (attendee.phone) {
      const phoneCandidates = byPhone.get(attendee.phone) ?? [];
      if (phoneCandidates.length === 1) {
        matchedParticipant = phoneCandidates[0];
        matchedBy = "phone";
      } else if (phoneCandidates.length > 1) {
        conflicts.push({
          attendee,
          candidates: phoneCandidates.map((item) => ({
            id: item.id,
            name: item.name,
            organization: item.organization ?? "",
          })),
        });
        continue;
      }
    }

    if (!matchedParticipant) {
      const nameCandidates = attendee.name ? byName.get(attendee.name) ?? [] : [];
      if (nameCandidates.length === 1) {
        matchedParticipant = nameCandidates[0];
        matchedBy = "name";
      } else if (nameCandidates.length > 1) {
        // 同名不自动猜测，交由管理员手动选择。
        conflicts.push({
          attendee,
          candidates: nameCandidates.map((item) => ({
            id: item.id,
            name: item.name,
            organization: item.organization ?? "",
          })),
        });
        continue;
      }
    }

    if (!matchedParticipant) {
      unmatched.push(attendee);
      continue;
    }

    const match: CheckInImportMatch = {
      attendee,
      participantId: matchedParticipant.id,
      participantName: matchedParticipant.name,
      matchedBy,
    };
    if (signedSet.has(matchedParticipant.id)) {
      alreadySigned.push(match);
    } else {
      importable.push(match);
    }
  }

  const matchedCount = importable.length + alreadySigned.length;
  const mergedCount = Math.max(0, dataRowCount - attendees.length);

  return {
    importable,
    alreadySigned,
    unmatched,
    conflicts,
    stats: {
      totalRows: dataRowCount,
      matchedCount,
      mergedCount,
      alreadySignedCount: alreadySigned.length,
      unmatchedCount: unmatched.length,
      conflictCount: conflicts.length,
      importableCount: importable.length,
    },
  };
};

// 导入备注：保留文件名、导入人、导入时间与入会/离会/时长摘要（不含敏感信息）。
export const buildTeacherTrainingImportNote = (params: {
  fileName: string;
  operatorName: string;
  importedAt: string;
  attendee: TencentAttendee;
}): string => {
  const parts = [
    "线上名单导入",
    params.attendee.joinTime ? `入会 ${params.attendee.joinTime}` : "",
    params.attendee.leaveTime ? `离会 ${params.attendee.leaveTime}` : "",
    params.attendee.durationMinutes ? `时长 ${params.attendee.durationMinutes} 分钟` : "",
    `文件：${params.fileName}`,
    `导入人：${params.operatorName}`,
    `导入时间：${params.importedAt}`,
  ].filter(Boolean);
  return parts.join("；");
};
