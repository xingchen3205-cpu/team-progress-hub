import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { assertRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { serializeExpertFeedback } from "@/lib/api-serializers";
import { saveUploadedFile } from "@/lib/uploads";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const experts = await prisma.expertFeedback.findMany({
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    include: {
      attachmentFiles: {
        orderBy: { uploadedAt: "asc" },
      },
    },
  });

  return NextResponse.json({ experts: experts.map(serializeExpertFeedback) });
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  try {
    assertRole(user.role, ["admin", "teacher", "leader"]);
  } catch {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const formData = await request.formData().catch(() => null);
  const date = `${formData?.get("date") ?? ""}`.trim() || new Date().toISOString().slice(0, 10);
  const expert = `${formData?.get("expert") ?? ""}`.trim();
  const topic = `${formData?.get("topic") ?? ""}`.trim();
  const format = `${formData?.get("format") ?? ""}`.trim() || "线上点评";
  const summary = `${formData?.get("summary") ?? ""}`.trim();
  const nextAction = `${formData?.get("nextAction") ?? ""}`.trim();
  const files = formData?.getAll("files").filter((entry): entry is File => entry instanceof File) ?? [];

  if (!expert || !topic || !summary || !nextAction) {
    return NextResponse.json({ message: "专家意见信息不完整" }, { status: 400 });
  }

  try {
    const storedFiles = await Promise.all(
      files.map((file) =>
        saveUploadedFile({
          file,
          folder: "experts",
        }),
      ),
    );

    const feedback = await prisma.expertFeedback.create({
      data: {
        date,
        expert,
        topic,
        format,
        summary,
        nextAction,
        attachments: JSON.stringify(storedFiles.map((item) => item.fileName)),
        attachmentFiles: {
          create: storedFiles.map((item) => ({
            fileName: item.fileName,
            filePath: item.filePath,
            fileSize: item.fileSize,
            mimeType: item.mimeType,
          })),
        },
      },
      include: {
        attachmentFiles: {
          orderBy: { uploadedAt: "asc" },
        },
      },
    });

    return NextResponse.json({ expert: serializeExpertFeedback(feedback) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "专家意见上传失败";
    const isValidationMessage =
      message === "不支持该文件格式" || message === "文件大小不能超过 20MB";
    return NextResponse.json(
      { message: isValidationMessage ? message : "专家意见上传失败" },
      { status: isValidationMessage ? 400 : 500 },
    );
  }
}
