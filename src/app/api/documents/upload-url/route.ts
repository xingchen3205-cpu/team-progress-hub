import { NextRequest, NextResponse } from "next/server";

import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { getSessionUser } from "@/lib/auth";
import { categoryValueToDb } from "@/lib/api-serializers";
import { validateDocumentCenterUploadMeta } from "@/lib/file-policy";
import { assertMainWorkspaceRole } from "@/lib/permissions";
import { PutObjectCommand, R2_BUCKET, r2Client } from "@/lib/r2";
import { buildStoredObjectKey } from "@/lib/uploads";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  try {
    assertMainWorkspaceRole(user.role);
  } catch {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        category?: "计划书" | "PPT" | "答辩材料" | "证明附件";
        fileName?: string;
        fileSize?: number;
        mimeType?: string;
      }
    | null;

  const categoryLabel = body?.category;
  const category = categoryLabel ? categoryValueToDb[categoryLabel] : null;
  const fileName = body?.fileName?.trim() || "";
  const fileSize = Number(body?.fileSize ?? 0);
  const mimeType = body?.mimeType?.trim() || "application/octet-stream";

  if (!category || !fileName || !fileSize) {
    return NextResponse.json({ message: "文档上传信息不完整" }, { status: 400 });
  }

  const validationError = validateDocumentCenterUploadMeta({
    fileName,
    fileSize,
    mimeType,
  });
  if (validationError) {
    return NextResponse.json({ message: validationError }, { status: 400 });
  }

  const { objectKey } = buildStoredObjectKey({
    fileName,
    category,
  });

  const uploadUrl = await getSignedUrl(
    r2Client,
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: objectKey,
      ContentType: mimeType,
    }),
    { expiresIn: 60 * 10 },
  );

  return NextResponse.json({
    uploadUrl,
    objectKey,
    contentType: mimeType,
  });
}
