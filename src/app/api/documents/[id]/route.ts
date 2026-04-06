import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { serializeDocument } from "@/lib/api-serializers";
import { canDeleteDocument, isPrivilegedReviewer } from "@/lib/document-workflow";
import { prisma } from "@/lib/prisma";
import { deleteStoredFile } from "@/lib/uploads";

export const runtime = "nodejs";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const { id } = await params;
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

  if (
    !canDeleteDocument({
      actorRole: user.role,
      actorId: user.id,
      ownerId: document.ownerId,
      status: document.status,
    })
  ) {
    return NextResponse.json({ message: "无权限删除该文档" }, { status: 403 });
  }

  if (document.status === "approved" && !isPrivilegedReviewer(user.role)) {
    return NextResponse.json(
      { message: "终审通过的文档仅指导教师或管理员可删除。" },
      { status: 403 },
    );
  }

  const fileKeys = document.versions.map((version) => version.filePath);

  await prisma.$transaction([
    prisma.documentVersion.deleteMany({
      where: {
        documentId: document.id,
      },
    }),
    prisma.document.delete({
      where: {
        id: document.id,
      },
    }),
  ]);

  await Promise.allSettled(fileKeys.map((fileKey) => deleteStoredFile(fileKey)));

  return NextResponse.json({
    success: true,
    document: serializeDocument(document),
  });
}
