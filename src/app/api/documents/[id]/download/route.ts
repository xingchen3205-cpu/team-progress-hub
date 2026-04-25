import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { buildAttachmentDisposition, buildInlineDisposition } from "@/lib/downloads";
import { assertMainWorkspaceRole } from "@/lib/permissions";
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
    assertMainWorkspaceRole(user.role);
  } catch {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const { id } = await params;
  const versionId = request.nextUrl.searchParams.get("versionId");
  const inline = request.nextUrl.searchParams.get("inline") === "1";

  const document = await prisma.document.findUnique({
    where: { id },
    include: {
      owner: {
        select: { teamGroupId: true },
      },
      versions: {
        orderBy: { uploadedAt: "desc" },
      },
    },
  });

  if (!document) {
    return NextResponse.json({ message: "文档不存在" }, { status: 404 });
  }

  if (!canAccessTeamScopedResource(user, {
    ownerId: document.ownerId,
    teamGroupId: document.teamGroupId ?? document.owner.teamGroupId,
  })) {
    return NextResponse.json({ message: "无权限访问该文档" }, { status: 403 });
  }

  const version =
    document.versions.find((item) => item.id === versionId) ??
    document.versions.find((item) => item.version === document.currentVersion) ??
    document.versions[0];

  if (!version) {
    return NextResponse.json({ message: "文件不存在" }, { status: 404 });
  }

  try {
    const fileData = await readStoredFile(version.filePath);

    return new NextResponse(fileData.buffer, {
      headers: {
        "Content-Type": fileData.contentType || version.mimeType || "application/octet-stream",
        "Content-Disposition": inline
          ? buildInlineDisposition(version.fileName)
          : buildAttachmentDisposition(version.fileName),
        "Content-Length": String(version.fileSize),
      },
    });
  } catch {
    return NextResponse.json({ message: "文件不存在或已丢失" }, { status: 404 });
  }
}
