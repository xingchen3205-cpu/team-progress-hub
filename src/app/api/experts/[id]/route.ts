import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { assertMainWorkspaceRole, assertRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { canAccessTeamScopedResource } from "@/lib/team-scope";
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

  try {
    assertMainWorkspaceRole(user.role);
    assertRole(user.role, ["admin", "teacher", "leader"]);
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
