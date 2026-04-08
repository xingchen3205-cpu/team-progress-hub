import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serializeDocument } from "@/lib/api-serializers";
import {
  canDeleteDocumentVersion,
  getUploadWorkflow,
  isPrivilegedReviewer,
} from "@/lib/document-workflow";
import { validateDocumentCenterUploadMeta } from "@/lib/file-policy";
import { createNotifications, getUserIdsByRoles } from "@/lib/notifications";
import { assertMainWorkspaceRole } from "@/lib/permissions";
import { deleteStoredFile, saveUploadedFile } from "@/lib/uploads";

export const runtime = "nodejs";

const getNextVersion = (currentVersion: string) => {
  const [, rawVersion = "1.0"] = currentVersion.match(/^v(.+)$/) ?? [];
  const [major, minor] = rawVersion.split(".").map((item) => Number(item));
  return `v${major}.${(minor || 0) + 1}`;
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  try {
    assertMainWorkspaceRole(user.role);
  } catch {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const { id } = await params;
  const formData = await request.formData().catch(() => null);
  const note = `${formData?.get("note") ?? ""}`.trim();
  const file = formData?.get("file");

  const currentDocument = await prisma.document.findUnique({ where: { id } });
  if (!currentDocument) {
    return NextResponse.json({ message: "文档不存在" }, { status: 404 });
  }

  if (!(file instanceof File)) {
    return NextResponse.json({ message: "请先选择文件" }, { status: 400 });
  }

  const nextVersion = getNextVersion(currentDocument.currentVersion);

  try {
    const workflow = getUploadWorkflow(user.role, true);
    const storedFile = await saveUploadedFile({
      file,
      category: currentDocument.category,
      validator: validateDocumentCenterUploadMeta,
    });

    const document = await prisma.document.update({
      where: { id },
      data: {
        currentVersion: nextVersion,
        status: workflow.status,
        comment: workflow.comment,
        versions: {
          create: {
            version: nextVersion,
            uploaderId: user.id,
            note: note || `${user.name} 上传新版本`,
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
          workflow.status === "pending" ? "文档新版本待负责人审批" : "文档新版本待教师终审",
        detail: `${user.name} 为《${document.name}》上传了 ${nextVersion}，请及时处理。`,
        type: "document_review",
        targetTab: "documents",
        relatedId: document.id,
      });
    }

    return NextResponse.json({ document: serializeDocument(document) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "文件上传失败";
    const isValidationMessage =
      message === "不支持该文件格式" || message === "文件大小不能超过 20MB";
    return NextResponse.json(
      { message: isValidationMessage ? message : "文件上传失败" },
      { status: isValidationMessage ? 400 : 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  try {
    assertMainWorkspaceRole(user.role);
  } catch {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const { id } = await params;
  const versionId = request.nextUrl.searchParams.get("versionId");

  if (!versionId) {
    return NextResponse.json({ message: "缺少版本编号" }, { status: 400 });
  }

  const document = await prisma.document.findUnique({
    where: { id },
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

  if (!document) {
    return NextResponse.json({ message: "文档不存在" }, { status: 404 });
  }

  const version = document.versions.find((item) => item.id === versionId);
  if (!version) {
    return NextResponse.json({ message: "版本不存在" }, { status: 404 });
  }

  if (
    !canDeleteDocumentVersion({
      actorRole: user.role,
      actorId: user.id,
      ownerId: document.ownerId,
      uploaderId: version.uploaderId,
      status: document.status,
    })
  ) {
    return NextResponse.json({ message: "无权限删除该版本" }, { status: 403 });
  }

  if (document.versions.length <= 1) {
    return NextResponse.json(
      { message: "当前文档只剩最后一个版本，请直接删除整个文档。" },
      { status: 409 },
    );
  }

  if (document.status === "approved" && !isPrivilegedReviewer(user.role)) {
    return NextResponse.json(
      { message: "终审通过的文档版本仅指导教师或管理员可删除。" },
      { status: 403 },
    );
  }

  const remainingVersions = document.versions.filter((item) => item.id !== versionId);
  const fallbackVersion = remainingVersions[0];
  const deletingCurrentVersion = version.version === document.currentVersion;

  if (deletingCurrentVersion) {
    await prisma.$transaction([
      prisma.documentVersion.delete({
        where: { id: version.id },
      }),
      prisma.document.update({
        where: { id: document.id },
        data: {
          currentVersion: fallbackVersion.version,
          status: "pending",
          comment: `已删除 ${version.version}，当前回退至 ${fallbackVersion.version}，请重新发起审批。`,
        },
      }),
    ]);
  } else {
    await prisma.documentVersion.delete({
      where: { id: version.id },
    });
  }

  await deleteStoredFile(version.filePath).catch(() => null);

  const refreshedDocument = await prisma.document.findUnique({
    where: { id: document.id },
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

  if (!refreshedDocument) {
    return NextResponse.json({ message: "文档不存在" }, { status: 404 });
  }

  return NextResponse.json({ document: serializeDocument(refreshedDocument) });
}
