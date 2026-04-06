import path from "node:path";

const toAsciiFallbackName = (fileName: string) => {
  const extension = path.extname(fileName);
  const baseName = path.basename(fileName, extension);
  const safeBaseName = baseName
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "_")
    .replace(/[^\w.-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  const normalizedBaseName = safeBaseName || "download";
  const normalizedExtension = extension.replace(/[^\w.]/g, "") || "";

  return `${normalizedBaseName}${normalizedExtension}`;
};

export const buildAttachmentDisposition = (fileName: string) =>
  `attachment; filename="${toAsciiFallbackName(fileName)}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;

export const buildInlineDisposition = (fileName: string) =>
  `inline; filename="${toAsciiFallbackName(fileName)}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
