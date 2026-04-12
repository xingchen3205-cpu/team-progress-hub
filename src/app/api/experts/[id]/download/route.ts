import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { buildAttachmentDisposition, buildInlineDisposition } from "@/lib/downloads";
import { assertExpertFeedbackAccess } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { canAccessTeamScopedResource } from "@/lib/team-scope";
import { readStoredFile } from "@/lib/uploads";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  try {
    assertExpertFeedbackAccess(user.role);
  } catch {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const { id } = await params;
  const attachmentId = request.nextUrl.searchParams.get("attachmentId");
  const inline = request.nextUrl.searchParams.get("inline") === "1";

  if (!attachmentId) {
    return NextResponse.json({ message: "缺少附件编号" }, { status: 400 });
  }

  const feedback = await prisma.expertFeedback.findUnique({
    where: { id },
    include: {
      attachmentFiles: true,
    },
  });

  if (!feedback) {
    return NextResponse.json({ message: "专家意见不存在" }, { status: 404 });
  }

  if (
    !canAccessTeamScopedResource(
      user,
      { ownerId: feedback.createdById, teamGroupId: feedback.teamGroupId },
      { allowUnassignedForGroupedUsers: true },
    )
  ) {
    return NextResponse.json({ message: "无权限查看该专家意见" }, { status: 403 });
  }

  const attachment = feedback.attachmentFiles.find((item) => item.id === attachmentId);
  if (!attachment) {
    return NextResponse.json({ message: "附件不存在" }, { status: 404 });
  }

  try {
    const fileData = await readStoredFile(attachment.filePath);

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
    return NextResponse.json({ message: "文件不存在或已丢失" }, { status: 404 });
  }
}
