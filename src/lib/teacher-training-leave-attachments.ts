import { getFileExtension, isMimeTypeAllowedForFileName, MAX_UPLOAD_SIZE } from "@/lib/file-policy";

export type TeacherTrainingLeaveAttachmentFile = {
  fileName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
};

export type TeacherTrainingLeaveAttachmentItem = {
  fileName: string;
  fileSize: number;
  mimeType: string;
  downloadUrl: string;
};

export const teacherTrainingLeaveAttachmentMaxSize = MAX_UPLOAD_SIZE;
export const teacherTrainingLeaveAttachmentMaxSizeLabel = "20MB";
export const teacherTrainingLeaveAttachmentAcceptAttribute = ".pdf,.doc,.docx,.jpg,.jpeg,.png";

const teacherTrainingLeaveAttachmentPrefix = "__teacher_training_leave_file_v1__:";
const teacherTrainingLeaveAttachmentExtensions = new Set([".pdf", ".doc", ".docx", ".jpg", ".jpeg", ".png"]);

export const getTeacherTrainingLeaveAttachmentObjectKeyPrefix = ({
  cohortId,
  participantId,
}: {
  cohortId: string;
  participantId: string;
}) => `teacher-training-leaves/${cohortId}/${participantId}/`;

export const validateTeacherTrainingLeaveAttachmentMeta = ({
  fileName,
  fileSize,
  mimeType,
}: {
  fileName: string;
  fileSize: number;
  mimeType?: string | null;
}) => {
  const extension = getFileExtension(fileName);
  if (!teacherTrainingLeaveAttachmentExtensions.has(extension)) {
    return "请假附件仅支持 PDF、Word、JPG 或 PNG 文件";
  }

  if (!isMimeTypeAllowedForFileName(fileName, mimeType)) {
    return "文件类型与扩展名不匹配，请重新选择真实文件";
  }

  if (!fileSize || fileSize <= 0) {
    return "附件文件为空，请重新选择";
  }

  if (fileSize > teacherTrainingLeaveAttachmentMaxSize) {
    return `附件大小不能超过 ${teacherTrainingLeaveAttachmentMaxSizeLabel}`;
  }

  return null;
};

const isValidTeacherTrainingLeaveAttachmentFile = (
  value: unknown,
): value is TeacherTrainingLeaveAttachmentFile => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<TeacherTrainingLeaveAttachmentFile>;
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

export const encodeTeacherTrainingLeaveAttachmentFile = (file: TeacherTrainingLeaveAttachmentFile) =>
  `${teacherTrainingLeaveAttachmentPrefix}${encodeURIComponent(JSON.stringify(file))}`;

export const decodeTeacherTrainingLeaveAttachmentFile = (
  attachment?: string | null,
): TeacherTrainingLeaveAttachmentFile | null => {
  const trimmed = attachment?.trim() ?? "";
  if (!trimmed.startsWith(teacherTrainingLeaveAttachmentPrefix)) {
    return null;
  }

  try {
    const parsedValue = JSON.parse(decodeURIComponent(trimmed.slice(teacherTrainingLeaveAttachmentPrefix.length))) as unknown;
    return isValidTeacherTrainingLeaveAttachmentFile(parsedValue) ? parsedValue : null;
  } catch {
    return null;
  }
};

export const getTeacherTrainingLeaveAttachmentLabel = (attachment?: string | null) => {
  const uploadedFile = decodeTeacherTrainingLeaveAttachmentFile(attachment);
  if (uploadedFile) {
    return uploadedFile.fileName;
  }

  return attachment?.trim() ?? "";
};

export const buildTeacherTrainingLeaveAttachmentDownloadUrl = (leaveRequestId: string) =>
  `/api/teacher-training/leave-requests/${encodeURIComponent(leaveRequestId)}/attachment`;
