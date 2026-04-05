import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serializeDocument } from "@/lib/api-serializers";
import { saveUploadedFile } from "@/lib/uploads";

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
    const storedFile = await saveUploadedFile({
      file,
      category: currentDocument.category,
    });

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
