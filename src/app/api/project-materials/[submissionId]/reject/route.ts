import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { serializeProjectMaterialSubmission } from "@/lib/api-serializers";
import { createNotifications } from "@/lib/notifications";
import { canReviewProjectMaterial } from "@/lib/project-materials";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const projectMaterialSubmissionInclude = {
  stage: {
    select: {
      id: true,
      name: true,
      type: true,
      isOpen: true,
      deadline: true,
    },
  },
  teamGroup: {
    select: {
      id: true,
      name: true,
    },
  },
  submitter: {
    select: {
      id: true,
      name: true,
      avatar: true,
      role: true,
    },
  },
  approver: {
    select: {
      id: true,
      name: true,
      avatar: true,
      role: true,
    },
  },
  rejecter: {
    select: {
      id: true,
      name: true,
      avatar: true,
      role: true,
    },
  },
} as const;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ submissionId: string }> },
) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { reason?: string } | null;
  const reason = body?.reason?.trim();
  if (!reason) {
    return NextResponse.json({ message: "请填写驳回原因" }, { status: 400 });
  }

  const { submissionId } = await params;
  const submission = await prisma.projectMaterialSubmission.findUnique({
    where: { id: submissionId },
    include: projectMaterialSubmissionInclude,
  });

  if (!submission) {
    return NextResponse.json({ message: "项目材料不存在" }, { status: 404 });
  }

  if (
    !canReviewProjectMaterial({
      role: user.role,
      actorTeamGroupId: user.teamGroupId,
      materialTeamGroupId: submission.teamGroupId,
    })
  ) {
    return NextResponse.json({ message: "无权限驳回项目材料" }, { status: 403 });
  }

  if (submission.status !== "pending") {
    return NextResponse.json({ message: "该材料已处理，不能重复驳回" }, { status: 409 });
  }

  const rejectedAt = new Date();
  const material = await prisma.projectMaterialSubmission.update({
    where: { id: submission.id },
    data: {
      status: "rejected",
      rejectedById: user.id,
      rejectedAt,
      rejectReason: reason,
      approvedById: null,
      approvedAt: null,
    },
    include: projectMaterialSubmissionInclude,
  });

  await createNotifications({
    userIds: [material.submittedById],
    title: "项目材料需修改",
    detail: `${material.stage.name} 的《${material.title}》被驳回：${reason}`,
    type: "project_material_rejected",
    targetTab: "project",
    relatedId: material.id,
    senderId: user.id,
  }).catch((error) => {
    console.error("[project-materials] rejection notification failed", error);
  });

  return NextResponse.json({
    material: serializeProjectMaterialSubmission(material),
  });
}
