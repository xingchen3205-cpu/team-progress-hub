import path from "node:path";

export const MAX_UPLOAD_SIZE = 20 * 1024 * 1024;
export const MAX_DOCUMENT_CENTER_UPLOAD_SIZE = 100 * 1024 * 1024;

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

export const documentArchiveExtensions = [
  ".zip",
  ".rar",
  ".7z",
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
export const documentCenterAcceptAttribute = [
  ...allowedFileExtensions,
  ...documentArchiveExtensions,
].join(",");

export const getFileExtension = (fileName: string) => path.extname(fileName).toLowerCase();

export const isAllowedUploadExtension = (fileName: string) =>
  allowedFileExtensions.includes(
    getFileExtension(fileName) as (typeof allowedFileExtensions)[number],
  );

export const isBlockedUploadExtension = (fileName: string) =>
  blockedFileExtensions.includes(
    getFileExtension(fileName) as (typeof blockedFileExtensions)[number],
  );

export const isDocumentArchiveExtension = (fileName: string) =>
  documentArchiveExtensions.includes(
    getFileExtension(fileName) as (typeof documentArchiveExtensions)[number],
  );

const allowedMimeTypesByExtension: Record<string, string[]> = {
  ".doc": ["application/msword"],
  ".docx": ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ".pdf": ["application/pdf"],
  ".xls": ["application/vnd.ms-excel"],
  ".xlsx": ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ".txt": ["text/plain"],
  ".jpg": ["image/jpeg"],
  ".jpeg": ["image/jpeg"],
  ".png": ["image/png"],
  ".zip": ["application/zip", "application/x-zip-compressed"],
  ".rar": ["application/vnd.rar", "application/x-rar", "application/x-rar-compressed"],
  ".7z": ["application/x-7z-compressed"],
  ".mp4": ["video/mp4"],
  ".mov": ["video/quicktime"],
  ".avi": ["video/x-msvideo", "video/avi"],
};

const browserFallbackMimeTypes = new Set(["", "application/octet-stream"]);

export const isMimeTypeAllowedForFileName = (fileName: string, mimeType?: string | null) => {
  const normalizedMimeType = mimeType?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (browserFallbackMimeTypes.has(normalizedMimeType)) {
    return true;
  }

  const allowedMimeTypes = allowedMimeTypesByExtension[getFileExtension(fileName)];
  if (!allowedMimeTypes) {
    return true;
  }

  return allowedMimeTypes.includes(normalizedMimeType);
};

export const validateUploadMeta = (
  {
    fileName,
    fileSize,
    mimeType,
  }: {
    fileName: string;
    fileSize: number;
    mimeType?: string | null;
  },
  options: {
    allowArchives?: boolean;
    maxSizeBytes?: number;
    maxSizeLabel?: string;
  } = {},
) => {
  const archiveAllowed = Boolean(options.allowArchives && isDocumentArchiveExtension(fileName));
  const maxSizeBytes = options.maxSizeBytes ?? MAX_UPLOAD_SIZE;
  const maxSizeLabel = options.maxSizeLabel ?? "20MB";

  if (
    !fileName ||
    (!isAllowedUploadExtension(fileName) && !archiveAllowed) ||
    (isBlockedUploadExtension(fileName) && !archiveAllowed)
  ) {
    return "不支持该文件格式";
  }

  if (!isMimeTypeAllowedForFileName(fileName, mimeType)) {
    return "文件类型与扩展名不匹配";
  }

  if (fileSize > maxSizeBytes) {
    return `文件大小不能超过 ${maxSizeLabel}`;
  }

  return null;
};

export const validateDocumentCenterUploadMeta = (meta: {
  fileName: string;
  fileSize: number;
  mimeType?: string | null;
}) =>
  validateUploadMeta(meta, {
    allowArchives: true,
    maxSizeBytes: MAX_DOCUMENT_CENTER_UPLOAD_SIZE,
    maxSizeLabel: "100MB",
  });
