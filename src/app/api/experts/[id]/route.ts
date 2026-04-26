import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { toIsoDateKey } from "@/lib/date";
import { assertMainWorkspaceRole, assertRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { serializeExpertFeedback } from "@/lib/api-serializers";
import { canAccessTeamScopedResource } from "@/lib/team-scope";
import { deleteStoredFile, saveUploadedFile } from "@/lib/uploads";

export const runtime = "nodejs";

const parseAttachmentNames = (attachments: string) => {
  try {
    const parsed = JSON.parse(attachments) as Array<string | { fileName?: string }>;
    return parsed
      .map((item) => (typeof item === "string" ? item : item.fileName))
      .filter((item): item is string => Boolean(item));
  } catch {
    return [];
  }
};

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  try {
    assertMainWorkspaceRole(user.role);
    assertRole(user.role, ["admin", "school_admin"]);
  } catch {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ message: "专家意见编号缺失" }, { status: 400 });
  }

  const feedback = await prisma.expertFeedback.findUnique({
    where: { id },
    include: { attachmentFiles: true },
  });

  if (!feedback) {
    return NextResponse.json({ message: "专家意见不存在" }, { status: 404 });
  }

  const formData = await request.formData().catch(() => null);
  const date = `${formData?.get("date") ?? ""}`.trim() || toIsoDateKey(new Date());
  const expert = `${formData?.get("expert") ?? ""}`.trim();
  const topic = `${formData?.get("topic") ?? ""}`.trim();
  const format = `${formData?.get("format") ?? ""}`.trim() || "线上点评";
  const requestedTeamGroupId = `${formData?.get("teamGroupId") ?? ""}`.trim() || null;
  const summary = `${formData?.get("summary") ?? ""}`.trim();
  const nextAction = `${formData?.get("nextAction") ?? ""}`.trim();
  const files = formData?.getAll("files").filter((entry): entry is File => entry instanceof File) ?? [];

  if (!expert || !topic || !summary || !nextAction) {
    return NextResponse.json({ message: "专家意见信息不完整" }, { status: 400 });
  }

  if (requestedTeamGroupId) {
    const targetGroup = await prisma.teamGroup.findUnique({
      where: { id: requestedTeamGroupId },
      select: { id: true },
    });
    if (!targetGroup) {
      return NextResponse.json({ message: "适用项目组不存在" }, { status: 400 });
    }
  }

  let storedFiles: Awaited<ReturnType<typeof saveUploadedFile>>[] = [];

  try {
    storedFiles = await Promise.all(
      files.map((file) =>
        saveUploadedFile({
          file,
          folder: "experts",
        }),
      ),
    );

    const updated = await prisma.expertFeedback.update({
      where: { id },
      data: {
        date,
        expert,
        topic,
        format,
        summary,
        nextAction,
        teamGroupId: requestedTeamGroupId,
        attachments: JSON.stringify([
          ...parseAttachmentNames(feedback.attachments),
          ...storedFiles.map((item) => item.fileName),
        ]),
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
        teamGroup: {
          select: { id: true, name: true },
        },
        attachmentFiles: {
          orderBy: { uploadedAt: "asc" },
        },
      },
    });

    return NextResponse.json({ expert: serializeExpertFeedback(updated) });
  } catch (error) {
    await Promise.allSettled(storedFiles.map((item) => deleteStoredFile(item.filePath)));

    const message = error instanceof Error ? error.message : "专家意见保存失败";
    const isValidationMessage =
      message === "不支持该文件格式" || message === "文件大小不能超过 20MB";
    return NextResponse.json(
      { message: isValidationMessage ? message : "专家意见保存失败" },
      { status: isValidationMessage ? 400 : 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  try {
    assertMainWorkspaceRole(user.role);
    assertRole(user.role, ["admin", "school_admin", "teacher", "leader"]);
  } catch {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ message: "专家意见编号缺失" }, { status: 400 });
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

  if (!canAccessTeamScopedResource(user, { ownerId: feedback.createdById, teamGroupId: feedback.teamGroupId })) {
    return NextResponse.json({ message: "无权限删除该专家意见" }, { status: 403 });
  }

  try {
    await prisma.expertFeedback.delete({
      where: { id },
    });

    await Promise.allSettled(
      feedback.attachmentFiles.map((attachment) => deleteStoredFile(attachment.filePath)),
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "专家意见删除失败";
    return NextResponse.json({ message: message || "专家意见删除失败" }, { status: 500 });
  }
}
