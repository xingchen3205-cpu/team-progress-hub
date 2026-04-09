import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { assertMainWorkspaceRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { canAccessTask } from "@/lib/task-access";
import { deleteStoredFile, saveUploadedFile } from "@/lib/uploads";

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
    assertMainWorkspaceRole(user.role);
  } catch {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const { id } = await params;
  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      assignments: {
        select: {
          assigneeId: true,
          assignee: { select: { teamGroupId: true } },
        },
      },
      assignee: { select: { teamGroupId: true } },
      creator: { select: { teamGroupId: true } },
      reviewer: { select: { teamGroupId: true } },
    },
  });

  if (!task) {
    return NextResponse.json({ message: "工单不存在" }, { status: 404 });
  }

  if (!canAccessTask(user, task)) {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const isAssignedExecutor =
    task.assigneeId === user.id || task.assignments.some((assignment) => assignment.assigneeId === user.id);

  if (task.status !== "doing" || !isAssignedExecutor) {
    return NextResponse.json({ message: "只有当前执行中的处理人可以为工单上传完成凭证" }, { status: 403 });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ message: "请先选择附件" }, { status: 400 });
  }

  let storedFile: Awaited<ReturnType<typeof saveUploadedFile>> | null = null;

  try {
    storedFile = await saveUploadedFile({
      file,
      folder: "task-evidence",
    });

    const attachment = await prisma.taskAttachment.create({
      data: {
        taskId: task.id,
        uploaderId: user.id,
        fileName: storedFile.fileName,
        filePath: storedFile.filePath,
        fileSize: storedFile.fileSize,
        mimeType: storedFile.mimeType,
      },
      include: {
        uploader: {
          select: { id: true, name: true },
        },
      },
    });

    return NextResponse.json(
      {
        attachment: {
          id: attachment.id,
          fileName: attachment.fileName,
          fileSize: attachment.fileSize,
          mimeType: attachment.mimeType,
          uploadedAt: attachment.uploadedAt.toISOString(),
          uploaderId: attachment.uploaderId,
          uploaderName: attachment.uploader.name,
          downloadUrl: `/api/tasks/${task.id}/attachments/${attachment.id}`,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (storedFile) {
      await Promise.allSettled([deleteStoredFile(storedFile.filePath)]);
    }

    return NextResponse.json(
      { message: error instanceof Error ? error.message : "附件上传失败" },
      { status: 400 },
    );
  }
}
