import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { assertRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { canAccessTeamScopedResource } from "@/lib/team-scope";
import { deleteStoredFile } from "@/lib/uploads";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  try {
    assertRole(user.role, ["admin", "teacher", "leader"]);
  } catch {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const { id } = await params;
  const assignment = await prisma.expertReviewAssignment.findUnique({
    where: { id },
    include: {
      reviewPackage: {
        include: {
          materials: true,
        },
      },
    },
  });

  if (!assignment) {
    return NextResponse.json({ message: "评审任务不存在" }, { status: 404 });
  }

  if (
    !canAccessTeamScopedResource(user, {
      ownerId: assignment.reviewPackage.createdById,
      teamGroupId: assignment.reviewPackage.teamGroupId,
    })
  ) {
    return NextResponse.json({ message: "无权限删除该评审任务" }, { status: 403 });
  }

  const fileKeys = assignment.reviewPackage.materials.map((item) => item.filePath);

  await prisma.expertReviewPackage.delete({
    where: { id: assignment.packageId },
  });

  await Promise.allSettled(fileKeys.map((fileKey) => deleteStoredFile(fileKey)));

  return NextResponse.json({ success: true });
}
