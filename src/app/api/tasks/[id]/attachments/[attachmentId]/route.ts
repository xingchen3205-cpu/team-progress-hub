import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { buildAttachmentDisposition, buildInlineDisposition } from "@/lib/downloads";
import { assertMainWorkspaceRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { canAccessTask } from "@/lib/task-access";
import { readStoredFile } from "@/lib/uploads";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> },
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

  const { id, attachmentId } = await params;
  const task = await prisma.task.findUnique({
    where: { id },
    include: {
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

  const attachment = await prisma.taskAttachment.findFirst({
    where: {
      id: attachmentId,
      taskId: id,
    },
  });

  if (!attachment) {
    return NextResponse.json({ message: "附件不存在" }, { status: 404 });
  }

  try {
    const fileData = await readStoredFile(attachment.filePath);
    const inline = request.nextUrl.searchParams.get("inline") === "1";

    return new NextResponse(fileData.buffer, {
      headers: {
        "Content-Type": fileData.contentType || attachment.mimeType || "application/octet-stream",
        "Content-Disposition": inline
          ? buildInlineDisposition(attachment.fileName)
          : buildAttachmentDisposition(attachment.fileName),
        "Content-Length": String(attachment.fileSize),
      },
    });
  } catch {
    return NextResponse.json({ message: "附件不存在或已丢失" }, { status: 404 });
  }
}
