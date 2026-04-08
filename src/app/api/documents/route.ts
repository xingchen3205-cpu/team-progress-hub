import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  categoryValueToDb,
  serializeDocument,
} from "@/lib/api-serializers";
import { getUploadWorkflow } from "@/lib/document-workflow";
import { validateDocumentCenterUploadMeta } from "@/lib/file-policy";
import { createNotifications, getUserIdsByRoles } from "@/lib/notifications";
import { assertMainWorkspaceRole } from "@/lib/permissions";
import { deleteStoredFile, saveUploadedFile } from "@/lib/uploads";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  try {
    assertMainWorkspaceRole(user.role);
  } catch {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const documents = await prisma.document.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      owner: {
        select: { id: true, name: true },
      },
      versions: {
        orderBy: { uploadedAt: "desc" },
        include: {
          uploader: {
            select: { name: true },
          },
        },
      },
    },
  });

  return NextResponse.json({ documents: documents.map(serializeDocument) });
}

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

  const formData = await request.formData().catch(() => null);
  const name = `${formData?.get("name") ?? ""}`.trim();
  const categoryLabel = `${formData?.get("category") ?? ""}`.trim() as
    | "计划书"
    | "PPT"
    | "答辩材料"
    | "证明附件";
  const note = `${formData?.get("note") ?? ""}`.trim() || `${user.name} 上传初始版本`;
  const file = formData?.get("file");
  const category = categoryLabel ? categoryValueToDb[categoryLabel] : null;

  if (!name || !category || !(file instanceof File)) {
    return NextResponse.json({ message: "文档信息不完整" }, { status: 400 });
  }

  let storedFile: Awaited<ReturnType<typeof saveUploadedFile>> | null = null;

  try {
    const workflow = getUploadWorkflow(user.role, false);
    storedFile = await saveUploadedFile({
      file,
      category,
      validator: validateDocumentCenterUploadMeta,
    });

    const document = await prisma.document.create({
      data: {
        name,
        category,
        ownerId: user.id,
        status: workflow.status,
        comment: workflow.comment,
        currentVersion: "v1.0",
        versions: {
          create: {
            version: "v1.0",
            uploaderId: user.id,
            note,
            fileName: storedFile.fileName,
            filePath: storedFile.filePath,
            fileSize: storedFile.fileSize,
            mimeType: storedFile.mimeType,
          },
        },
      },
      include: {
        owner: {
          select: { id: true, name: true },
        },
        versions: {
          orderBy: { uploadedAt: "desc" },
          include: {
            uploader: {
              select: { name: true },
            },
          },
        },
      },
    });

    if (workflow.notificationTargetRoles.length > 0) {
      const recipientIds = await getUserIdsByRoles({
        roles: workflow.notificationTargetRoles,
        excludeUserIds: [user.id],
      });

      await createNotifications({
        userIds: recipientIds,
        documentId: document.id,
        title:
          workflow.status === "pending" ? "文档待负责人审批" : "文档待教师终审",
        detail: `${user.name} 上传了《${document.name}》，请及时处理。`,
        type: "document_review",
        targetTab: "documents",
        relatedId: document.id,
      });
    }

    return NextResponse.json({ document: serializeDocument(document) }, { status: 201 });
  } catch (error) {
    if (storedFile) {
      await Promise.allSettled([deleteStoredFile(storedFile.filePath)]);
    }

    const message = error instanceof Error ? error.message : "文件上传失败";
    const isValidationMessage =
      message === "不支持该文件格式" || message === "文件大小不能超过 20MB";
    return NextResponse.json(
      { message: isValidationMessage ? message : "文件上传失败" },
      { status: isValidationMessage ? 400 : 500 },
    );
  }
}
