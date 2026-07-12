import { prisma } from "@/lib/prisma";
import {
  analyzeTencentCheckInImport,
  parseDelimitedRows,
  parseTencentMeetingRows,
  type CheckInImportAnalysis,
} from "@/lib/teacher-training-checkin-import";
import { getFileExtension, parseTeacherTrainingWorkbookRows } from "@/lib/teacher-training-workbook";

export const teacherTrainingCheckInImportMaxBytes = 8 * 1024 * 1024;

export type CheckInImportFileResult =
  | { ok: true; rows: string[][] }
  | { ok: false; message: string; status: number };

// 解析上传的签到名单文件（.xlsx / .csv），复用现有 Excel 解析工具，限制 8MB。
export const parseCheckInImportFile = async (file: unknown): Promise<CheckInImportFileResult> => {
  if (!(file instanceof File)) {
    return { ok: false, message: "请上传腾讯会议签到名单文件", status: 400 };
  }
  if (file.size > teacherTrainingCheckInImportMaxBytes) {
    return { ok: false, message: "导入文件最大 8MB，请拆分后再上传", status: 400 };
  }
  const extension = getFileExtension(file.name);
  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    if (extension === ".xlsx") {
      return { ok: true, rows: await parseTeacherTrainingWorkbookRows(buffer) };
    }
    if (extension === ".csv" || extension === ".tsv" || extension === ".txt") {
      return { ok: true, rows: parseDelimitedRows(buffer.toString("utf8")) };
    }
    if (extension === ".xls") {
      return { ok: false, message: "旧版 .xls 暂不支持，请另存为 .xlsx 后上传", status: 400 };
    }
    return { ok: false, message: "签到名单仅支持 Excel(.xlsx) 或 CSV 文件", status: 400 };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "签到名单文件解析失败",
      status: 400,
    };
  }
};

export type CheckInImportAnalysisResult =
  | { ok: true; analysis: CheckInImportAnalysis }
  | { ok: false; message: string; status: number };

// 解析名单并与本班次参训教师匹配；alreadySignedParticipantIds 用于跳过已签到（不覆盖）。
export const analyzeCheckInImport = async (params: {
  rows: string[][];
  cohortId: string;
  alreadySignedParticipantIds: Iterable<string>;
}): Promise<CheckInImportAnalysisResult> => {
  const parsed = parseTencentMeetingRows(params.rows);
  if (!parsed.ok) {
    return { ok: false, message: parsed.error, status: 400 };
  }
  if (parsed.attendees.length === 0) {
    return { ok: false, message: "名单为空，没有可识别的参会人员", status: 400 };
  }

  const participants = await prisma.teacherTrainingParticipant.findMany({
    where: { cohortId: params.cohortId, cohort: { deletedAt: null } },
    select: { id: true, name: true, phone: true, organization: true },
  });

  const analysis = analyzeTencentCheckInImport(
    parsed.attendees,
    participants,
    params.alreadySignedParticipantIds,
    parsed.dataRowCount,
  );
  return { ok: true, analysis };
};
