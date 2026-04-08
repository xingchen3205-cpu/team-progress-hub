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

export const validateUploadMeta = (
  {
    fileName,
    fileSize,
  }: {
    fileName: string;
    fileSize: number;
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

  if (fileSize > maxSizeBytes) {
    return `文件大小不能超过 ${maxSizeLabel}`;
  }

  return null;
};

export const validateDocumentCenterUploadMeta = (meta: { fileName: string; fileSize: number }) =>
  validateUploadMeta(meta, {
    allowArchives: true,
    maxSizeBytes: MAX_DOCUMENT_CENTER_UPLOAD_SIZE,
    maxSizeLabel: "100MB",
  });
