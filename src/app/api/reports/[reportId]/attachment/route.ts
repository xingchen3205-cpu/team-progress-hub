import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { buildAttachmentDisposition } from "@/lib/downloads";
import { assertMainWorkspaceRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { decodeReportAttachmentFile } from "@/lib/report-attachments";
import { getScopedReportViewFilter } from "@/lib/report-history";
import { readStoredFile } from "@/lib/uploads";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ reportId: string }> },
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

  const { reportId } = await params;
  const reportWhere = getScopedReportViewFilter({
    role: user.role,
    userId: user.id,
    viewerTeamGroupId: user.teamGroupId,
    selectedTeamGroupId: null,
  });
  const report = await prisma.report.findFirst({
    where: reportWhere
      ? {
          AND: [{ id: reportId }, reportWhere],
        }
      : { id: reportId },
  });

  if (!report) {
    return NextResponse.json({ message: "汇报不存在" }, { status: 404 });
  }

  const attachmentFile = decodeReportAttachmentFile(report.attachment);
  if (!attachmentFile) {
    return NextResponse.json({ message: "附件不存在" }, { status: 404 });
  }

  try {
    const fileData = await readStoredFile(attachmentFile.filePath);

    return new NextResponse(fileData.buffer, {
      headers: {
        "Content-Type": fileData.contentType || attachmentFile.mimeType || "application/octet-stream",
        "Content-Disposition": buildAttachmentDisposition(attachmentFile.fileName),
        "Content-Length": String(attachmentFile.fileSize),
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ message: "附件不存在或已丢失" }, { status: 404 });
  }
}
