import path from "node:path";

import type { DocumentCategory } from "@prisma/client";

import { validateUploadMeta } from "@/lib/file-policy";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  R2_BUCKET,
  r2Client,
} from "@/lib/r2";

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
  folder,
}: {
  file: File;
  category?: DocumentCategory;
  folder?: string;
}) {
  const validationError = validateUploadMeta({
    fileName: file.name,
    fileSize: file.size,
  });

  if (validationError) {
    throw new Error(validationError);
  }

  const targetFolder = folder || (category ? uploadFolderByCategory[category] : null);
  if (!targetFolder) {
    throw new Error("上传目录缺失");
  }

  const safeFileName = `${Date.now()}_${sanitizeBaseName(file.name)}`;
  const objectKey = `${targetFolder}/${safeFileName}`;
  const fileBuffer = Buffer.from(await file.arrayBuffer());

  await r2Client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: objectKey,
      Body: fileBuffer,
      ContentType: file.type || "application/octet-stream",
    }),
  );

  return {
    fileName: file.name,
    filePath: objectKey,
    fileSize: file.size,
    mimeType: file.type || "application/octet-stream",
  };
}

export async function readStoredFile(objectKey: string) {
  const response = await r2Client.send(
    new GetObjectCommand({
      Bucket: R2_BUCKET,
      Key: objectKey,
    }),
  );

  if (!response.Body) {
    throw new Error("文件不存在或已丢失");
  }

  return {
    buffer: Buffer.from(await response.Body.transformToByteArray()),
    contentType: response.ContentType || "application/octet-stream",
  };
}

export async function deleteStoredFile(objectKey: string) {
  if (!objectKey) {
    return;
  }

  await r2Client.send(
    new DeleteObjectCommand({
      Bucket: R2_BUCKET,
      Key: objectKey,
    }),
  );
}
