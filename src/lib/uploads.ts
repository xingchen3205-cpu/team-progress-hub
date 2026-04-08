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

export const getUploadFolderByCategory = (category: DocumentCategory) => uploadFolderByCategory[category];

export const sanitizeUploadFileName = (fileName: string) =>
  path
    .basename(fileName)
    .replace(/[^\w.\-\u4e00-\u9fa5]/g, "_")
    .replace(/_+/g, "_");

export const buildStoredObjectKey = ({
  fileName,
  category,
  folder,
}: {
  fileName: string;
  category?: DocumentCategory;
  folder?: string;
}) => {
  const targetFolder = folder || (category ? uploadFolderByCategory[category] : null);
  if (!targetFolder) {
    throw new Error("上传目录缺失");
  }

  const safeFileName = `${Date.now()}_${sanitizeUploadFileName(fileName)}`;
  return {
    targetFolder,
    objectKey: `${targetFolder}/${safeFileName}`,
  };
};

export const uploadBufferToStorage = async ({
  objectKey,
  fileBuffer,
  contentType,
}: {
  objectKey: string;
  fileBuffer: Buffer;
  contentType: string;
}) => {
  await r2Client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: objectKey,
      Body: fileBuffer,
      ContentType: contentType || "application/octet-stream",
    }),
  );
};

export async function readStoredFileRange({
  objectKey,
  start,
  end,
}: {
  objectKey: string;
  start: number;
  end: number;
}) {
  const response = await r2Client.send(
    new GetObjectCommand({
      Bucket: R2_BUCKET,
      Key: objectKey,
      Range: `bytes=${start}-${end}`,
    }),
  );

  if (!response.Body) {
    throw new Error("文件不存在或已丢失");
  }

  return Buffer.from(await response.Body.transformToByteArray());
}

export async function saveUploadedFile({
  file,
  category,
  folder,
  validator,
}: {
  file: File;
  category?: DocumentCategory;
  folder?: string;
  validator?: (meta: { fileName: string; fileSize: number }) => string | null;
}) {
  const validationError = (validator ?? validateUploadMeta)({
    fileName: file.name,
    fileSize: file.size,
  });

  if (validationError) {
    throw new Error(validationError);
  }

  const { objectKey } = buildStoredObjectKey({
    fileName: file.name,
    category,
    folder,
  });
  const fileBuffer = Buffer.from(await file.arrayBuffer());

  await uploadBufferToStorage({
    objectKey,
    fileBuffer,
    contentType: file.type || "application/octet-stream",
  });

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
