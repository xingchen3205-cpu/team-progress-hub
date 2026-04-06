import { NextRequest, NextResponse } from "next/server";

import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { getSessionUser } from "@/lib/auth";
import { validateExpertReviewMaterial } from "@/lib/expert-review";
import { assertRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { PutObjectCommand, R2_BUCKET, r2Client } from "@/lib/r2";
import { buildStoredObjectKey } from "@/lib/uploads";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  try {
    assertRole(user.role, ["admin", "teacher", "leader"]);
  } catch {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const { id } = await params;
  const assignment = await prisma.expertReviewAssignment.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!assignment) {
    return NextResponse.json({ message: "评审任务不存在" }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        kind?: "plan" | "ppt" | "video";
        fileName?: string;
        fileSize?: number;
        mimeType?: string;
      }
    | null;

  const kind = body?.kind;
  const fileName = body?.fileName?.trim() || "";
  const fileSize = Number(body?.fileSize ?? 0);
  const mimeType = body?.mimeType?.trim() || "application/octet-stream";

  if (!kind || !["plan", "ppt", "video"].includes(kind) || !fileName || !fileSize) {
    return NextResponse.json({ message: "评审材料信息不完整" }, { status: 400 });
  }

  const validationError = validateExpertReviewMaterial({
    kind,
    fileName,
    fileSize,
  });
  if (validationError) {
    return NextResponse.json({ message: validationError }, { status: 400 });
  }

  const { objectKey } = buildStoredObjectKey({
    fileName,
    folder: "expert-review",
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
