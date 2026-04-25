import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { buildAttachmentDisposition, buildInlineDisposition } from "@/lib/downloads";
import { hasGlobalAdminPrivileges } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { readStoredFile } from "@/lib/uploads";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ submissionId: string }> },
) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  if (!hasGlobalAdminPrivileges(user.role)) {
    return NextResponse.json({ message: "无权限预览项目材料" }, { status: 403 });
  }

  const { submissionId } = await params;
  const material = await prisma.projectMaterialSubmission.findUnique({
    where: { id: submissionId },
    select: {
      id: true,
      fileName: true,
      filePath: true,
      fileSize: true,
      mimeType: true,
    },
  });

  if (!material) {
    return NextResponse.json({ message: "项目材料不存在" }, { status: 404 });
  }

  try {
    const fileData = await readStoredFile(material.filePath);
    const inline = request.nextUrl.searchParams.get("inline") === "1";

    return new NextResponse(fileData.buffer, {
      headers: {
        "Content-Type": fileData.contentType || material.mimeType || "application/octet-stream",
        "Content-Disposition": inline
          ? buildInlineDisposition(material.fileName)
          : buildAttachmentDisposition(material.fileName),
        "Content-Length": String(material.fileSize),
      },
    });
  } catch {
    return NextResponse.json({ message: "项目材料文件不存在或已丢失" }, { status: 404 });
  }
}
