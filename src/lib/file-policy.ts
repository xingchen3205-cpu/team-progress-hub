import path from "node:path";

export const MAX_UPLOAD_SIZE = 20 * 1024 * 1024;

export const allowedFileExtensions = [
  ".doc",
  ".docx",
  ".pdf",
  ".xls",
  ".xlsx",
  ".txt",
  ".jpg",
  ".jpeg",
  ".png",
] as const;

export const blockedFileExtensions = [
  ".mp4",
  ".mov",
  ".avi",
  ".zip",
  ".rar",
  ".ppt",
  ".pptx",
] as const;

export const documentAcceptAttribute = allowedFileExtensions.join(",");

export const getFileExtension = (fileName: string) => path.extname(fileName).toLowerCase();

export const isAllowedUploadExtension = (fileName: string) =>
  allowedFileExtensions.includes(
    getFileExtension(fileName) as (typeof allowedFileExtensions)[number],
  );

export const isBlockedUploadExtension = (fileName: string) =>
  blockedFileExtensions.includes(
    getFileExtension(fileName) as (typeof blockedFileExtensions)[number],
  );

export const validateUploadMeta = ({
  fileName,
  fileSize,
}: {
  fileName: string;
  fileSize: number;
}) => {
  if (!fileName || !isAllowedUploadExtension(fileName) || isBlockedUploadExtension(fileName)) {
    return "不支持该文件格式";
  }

  if (fileSize > MAX_UPLOAD_SIZE) {
    return "文件大小不能超过 20MB";
  }

  return null;
};
