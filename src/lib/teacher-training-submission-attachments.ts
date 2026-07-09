import { getFileExtension, isMimeTypeAllowedForFileName, MAX_UPLOAD_SIZE } from "@/lib/file-policy";

export type TeacherTrainingSubmissionAttachmentFile = {
  fileName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
};

export type TeacherTrainingSubmissionAttachmentItem = {
  fileName: string;
  fileSize: number;
  mimeType: string;
  downloadUrl: string;
};

export const teacherTrainingSubmissionAttachmentMaxSize = MAX_UPLOAD_SIZE;
export const teacherTrainingSubmissionAttachmentMaxSizeLabel = "20MB";
export const teacherTrainingSubmissionAttachmentAcceptAttribute = ".pdf,.doc,.docx";

const teacherTrainingSubmissionAttachmentPrefix = "__teacher_training_submission_file_v1__:";
const teacherTrainingSubmissionAttachmentExtensions = new Set([".pdf", ".doc", ".docx"]);
const teacherTrainingSubmissionPdfExtensions = new Set([".pdf"]);
const teacherTrainingSubmissionWordExtensions = new Set([".doc", ".docx"]);

export const getTeacherTrainingSubmissionAttachmentObjectKeyPrefix = ({
  cohortId,
  participantId,
  taskId,
}: {
  cohortId: string;
  participantId: string;
  taskId: string;
}) => `teacher-training-submissions/${cohortId}/${participantId}/${taskId}/`;

export const validateTeacherTrainingSubmissionAttachmentMeta = ({
  fileName,
  fileSize,
  mimeType,
}: {
  fileName: string;
  fileSize: number;
  mimeType?: string | null;
}) => {
  const extension = getFileExtension(fileName);
  if (!teacherTrainingSubmissionAttachmentExtensions.has(extension)) {
    return "任务汇报附件仅支持 Word 或 PDF 文件";
  }

  if (!isMimeTypeAllowedForFileName(fileName, mimeType)) {
    return "文件类型与扩展名不匹配，请上传真实的 Word 或 PDF 文件";
  }

  if (!fileSize || fileSize <= 0) {
    return "附件文件为空，请重新选择";
  }

  if (fileSize > teacherTrainingSubmissionAttachmentMaxSize) {
    return `附件大小不能超过 ${teacherTrainingSubmissionAttachmentMaxSizeLabel}`;
  }

  return null;
};

const isValidTeacherTrainingSubmissionAttachmentFile = (
  value: unknown,
): value is TeacherTrainingSubmissionAttachmentFile => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<TeacherTrainingSubmissionAttachmentFile>;
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

export const encodeTeacherTrainingSubmissionAttachmentFile = (
  file: TeacherTrainingSubmissionAttachmentFile,
) => `${teacherTrainingSubmissionAttachmentPrefix}${encodeURIComponent(JSON.stringify(file))}`;

export const decodeTeacherTrainingSubmissionAttachmentFile = (
  attachment?: string | null,
): TeacherTrainingSubmissionAttachmentFile | null => {
  const trimmed = attachment?.trim() ?? "";
  if (!trimmed.startsWith(teacherTrainingSubmissionAttachmentPrefix)) {
    return null;
  }

  try {
    const parsedValue = JSON.parse(decodeURIComponent(trimmed.slice(teacherTrainingSubmissionAttachmentPrefix.length))) as unknown;
    return isValidTeacherTrainingSubmissionAttachmentFile(parsedValue) ? parsedValue : null;
  } catch {
    return null;
  }
};

export const getTeacherTrainingSubmissionAttachmentLabel = (attachment?: string | null) => {
  const uploadedFile = decodeTeacherTrainingSubmissionAttachmentFile(attachment);
  if (uploadedFile) {
    return uploadedFile.fileName;
  }

  return attachment?.trim() ?? "";
};

export const buildTeacherTrainingSubmissionAttachmentDownloadUrl = (submissionId: string) =>
  `/api/teacher-training/submissions/${encodeURIComponent(submissionId)}/attachment`;

export const isTeacherTrainingSubmissionAttachmentPdfFile = (fileName?: string | null) =>
  teacherTrainingSubmissionPdfExtensions.has(getFileExtension(fileName ?? ""));

export const isTeacherTrainingSubmissionAttachmentWordFile = (fileName?: string | null) =>
  teacherTrainingSubmissionWordExtensions.has(getFileExtension(fileName ?? ""));
