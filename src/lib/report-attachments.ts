export type ReportAttachmentFile = {
  fileName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
};

const reportAttachmentPrefix = "__report_file_v1__:";

const isValidReportAttachmentFile = (value: unknown): value is ReportAttachmentFile => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ReportAttachmentFile>;
  return (
    typeof candidate.fileName === "string" &&
    candidate.fileName.trim().length > 0 &&
    typeof candidate.filePath === "string" &&
    candidate.filePath.trim().length > 0 &&
    typeof candidate.fileSize === "number" &&
    Number.isFinite(candidate.fileSize) &&
    candidate.fileSize > 0 &&
    typeof candidate.mimeType === "string" &&
    candidate.mimeType.trim().length > 0
  );
};

export const encodeReportAttachmentFile = (file: ReportAttachmentFile) =>
  `${reportAttachmentPrefix}${encodeURIComponent(JSON.stringify(file))}`;

export const decodeReportAttachmentFile = (attachment?: string | null): ReportAttachmentFile | null => {
  const trimmed = attachment?.trim() ?? "";
  if (!trimmed.startsWith(reportAttachmentPrefix)) {
    return null;
  }

  try {
    const parsedValue = JSON.parse(decodeURIComponent(trimmed.slice(reportAttachmentPrefix.length))) as unknown;
    return isValidReportAttachmentFile(parsedValue) ? parsedValue : null;
  } catch {
    return null;
  }
};

export const getReportAttachmentNote = (attachment?: string | null) => {
  const uploadedFile = decodeReportAttachmentFile(attachment);
  if (uploadedFile) {
    return uploadedFile.fileName;
  }

  const trimmed = attachment?.trim() ?? "";
  return trimmed && trimmed !== "未上传附件" ? trimmed : null;
};

export const buildReportAttachmentDownloadUrl = (reportId: string) => `/api/reports/${reportId}/attachment`;
