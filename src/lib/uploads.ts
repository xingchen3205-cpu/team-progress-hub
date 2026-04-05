import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { DocumentCategory } from "@prisma/client";

import { validateUploadMeta } from "@/lib/file-policy";

const UPLOAD_ROOT = process.env.UPLOAD_ROOT || "/opt/team-progress-hub/uploads";

const uploadFolderByCategory: Record<DocumentCategory, string> = {
  plan: "plans",
  ppt: "ppt",
  defense: "defense",
  proof: "proof",
};

const sanitizeBaseName = (fileName: string) =>
  path
    .basename(fileName)
    .replace(/[^\w.\-\u4e00-\u9fa5]/g, "_")
    .replace(/_+/g, "_");

export async function saveUploadedFile({
  file,
  category,
}: {
  file: File;
  category: DocumentCategory;
}) {
  const validationError = validateUploadMeta({
    fileName: file.name,
    fileSize: file.size,
  });

  if (validationError) {
    throw new Error(validationError);
  }

  const folderName = uploadFolderByCategory[category];
  const uploadDir = path.join(UPLOAD_ROOT, folderName);
  await mkdir(uploadDir, { recursive: true });

  const safeFileName = `${Date.now()}_${sanitizeBaseName(file.name)}`;
  const targetPath = path.join(uploadDir, safeFileName);
  const fileBuffer = Buffer.from(await file.arrayBuffer());

  await writeFile(targetPath, fileBuffer);

  return {
    fileName: file.name,
    filePath: targetPath,
    fileSize: file.size,
    mimeType: file.type || "application/octet-stream",
  };
}

export async function readStoredFile(filePath: string) {
  return readFile(filePath);
}
