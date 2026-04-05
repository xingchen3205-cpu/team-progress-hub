import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serializeDocument } from "@/lib/api-serializers";

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

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as
    | { note?: string }
    | null;

  const currentDocument = await prisma.document.findUnique({ where: { id } });
  if (!currentDocument) {
    return NextResponse.json({ message: "文档不存在" }, { status: 404 });
  }

  const nextVersion = getNextVersion(currentDocument.currentVersion);

  const document = await prisma.document.update({
    where: { id },
    data: {
      currentVersion: nextVersion,
      status: "pending",
      comment: "已上传新版本，等待审核",
      versions: {
        create: {
          version: nextVersion,
          uploaderId: user.id,
          note: body?.note?.trim() || `${user.name} 上传新版本`,
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

  return NextResponse.json({ document: serializeDocument(document) });
}
