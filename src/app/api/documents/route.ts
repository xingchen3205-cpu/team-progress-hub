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
import { buildDocumentVisibilityWhere } from "@/lib/team-scope";
import { deleteStoredFile, getUploadFolderByCategory, saveUploadedFile } from "@/lib/uploads";

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
    where: buildDocumentVisibilityWhere(user),
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

  const contentType = request.headers.get("content-type") || "";
  const jsonBody = contentType.includes("application/json")
    ? ((await request.json().catch(() => null)) as
        | {
            name?: string;
            category?: "计划书" | "PPT" | "答辩材料" | "证明附件";
            note?: string;
            fileName?: string;
            filePath?: string;
            fileSize?: number;
            mimeType?: string;
          }
        | null)
    : null;
  const formData = jsonBody ? null : await request.formData().catch(() => null);
  const name = `${jsonBody?.name ?? formData?.get("name") ?? ""}`.trim();
  const categoryLabel = `${jsonBody?.category ?? formData?.get("category") ?? ""}`.trim() as
    | "计划书"
    | "PPT"
    | "答辩材料"
    | "证明附件";
  const note = `${jsonBody?.note ?? formData?.get("note") ?? ""}`.trim() || `${user.name} 上传初始版本`;
  const file = formData?.get("file");
  const category = categoryLabel ? categoryValueToDb[categoryLabel] : null;
  const directFile = jsonBody
    ? {
        fileName: jsonBody.fileName?.trim() || "",
        filePath: jsonBody.filePath?.trim() || "",
        fileSize: Number(jsonBody.fileSize ?? 0),
        mimeType: jsonBody.mimeType?.trim() || "application/octet-stream",
      }
    : null;

  if (!name || !category || (!(file instanceof File) && !directFile)) {
    return NextResponse.json({ message: "文档信息不完整" }, { status: 400 });
  }

  if (directFile) {
    const validationError = validateDocumentCenterUploadMeta(directFile);
    if (validationError) {
      await deleteStoredFile(directFile.filePath).catch(() => null);
      return NextResponse.json({ message: validationError }, { status: 400 });
    }

    const expectedFolder = getUploadFolderByCategory(category);
    if (!directFile.filePath.startsWith(`${expectedFolder}/`)) {
      await deleteStoredFile(directFile.filePath).catch(() => null);
      return NextResponse.json({ message: "文件存储路径不匹配" }, { status: 400 });
    }
  }

  let storedFile: Awaited<ReturnType<typeof saveUploadedFile>> | null = null;

  try {
    const workflow = getUploadWorkflow(user.role, false);
    storedFile = directFile ?? await saveUploadedFile({
      file: file as File,
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

    try {
      if (workflow.notificationTargetRoles.length > 0) {
        const recipientIds = await getUserIdsByRoles({
          roles: workflow.notificationTargetRoles,
          excludeUserIds: [user.id],
          teamGroupId: user.teamGroupId,
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
          email: { noticeType: "文档审批", actionLabel: "进入系统处理" },
          emailTeamGroupId: user.teamGroupId ?? null,
        });
      }
    } catch (error) {
      console.error("Document review notification failed", error);
    }

    return NextResponse.json({ document: serializeDocument(document) }, { status: 201 });
  } catch (error) {
    if (storedFile) {
      await Promise.allSettled([deleteStoredFile(storedFile.filePath)]);
    }

    const message = error instanceof Error ? error.message : "文件上传失败";
    const isValidationMessage =
      message === "不支持该文件格式" ||
      message === "文件大小不能超过 20MB" ||
      message === "文件大小不能超过 100MB";
    return NextResponse.json(
      { message: isValidationMessage ? message : "文件上传失败" },
      { status: isValidationMessage ? 400 : 500 },
    );
  }
}
