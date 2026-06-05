import { NextRequest, NextResponse } from "next/server";

import { getExpertReviewWindowState } from "@/lib/expert-review";
import { hashExpertReviewGuestToken } from "@/lib/expert-review-guest-token";
import { prisma } from "@/lib/prisma";

const formatScore = (score?: { totalScore: number; lockedAt: Date | null } | null) => {
  if (!score) return null;
  return (score.totalScore / 100).toFixed(2);
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const normalizedToken = token?.trim();
  const now = new Date();

  if (!normalizedToken) {
    return NextResponse.json({ message: "缺少专家评分链接" }, { status: 401 });
  }

  const guestToken = await prisma.expertReviewGuestToken.findFirst({
    where: {
      tokenHash: hashExpertReviewGuestToken(normalizedToken),
      revokedAt: null,
      tokenExpiresAt: { gt: now },
    },
    select: {
      id: true,
      expertUserId: true,
      projectReviewStageId: true,
      tokenExpiresAt: true,
      expertUser: {
        select: {
          name: true,
        },
      },
      projectReviewStage: {
        select: {
          name: true,
          type: true,
          startAt: true,
          deadline: true,
        },
      },
    },
  });

  if (!guestToken) {
    return NextResponse.json({ message: "专家评分链接无效或已过期" }, { status: 404 });
  }

  await prisma.expertReviewGuestToken.update({
    where: { id: guestToken.id },
    data: { lastUsedAt: now },
  });

  const assignments = await prisma.expertReviewAssignment.findMany({
    where: {
      expertUserId: guestToken.expertUserId,
      reviewPackage: {
        projectReviewStageId: guestToken.projectReviewStageId,
        status: "configured",
      },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      status: true,
      createdAt: true,
      score: {
        select: {
          id: true,
          totalScore: true,
          commentTotal: true,
          submittedAt: true,
          updatedAt: true,
          lockedAt: true,
        },
      },
      reviewPackage: {
        select: {
          id: true,
          targetName: true,
          roundLabel: true,
          overview: true,
          startAt: true,
          deadline: true,
          materials: {
            orderBy: { uploadedAt: "asc" },
            select: {
              id: true,
              kind: true,
              name: true,
              fileName: true,
              fileSize: true,
              mimeType: true,
              uploadedAt: true,
            },
          },
        },
      },
    },
  });

  const latestReviewDisplaySession = await prisma.reviewDisplaySession.findFirst({
    where: {
      reviewPackage: {
        projectReviewStageId: guestToken.projectReviewStageId,
      },
      status: { not: "closed" },
      tokenExpiresAt: { gt: now },
    },
    orderBy: { createdAt: "desc" },
    select: {
      projectOrders: {
        where: {
          reviewPackage: {
            projectReviewStageId: guestToken.projectReviewStageId,
          },
        },
        orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
        select: {
          packageId: true,
          orderIndex: true,
        },
      },
    },
  });
  const orderIndexByPackageId = new Map<string, number>();
  for (const order of latestReviewDisplaySession?.projectOrders ?? []) {
    if (!orderIndexByPackageId.has(order.packageId)) {
      orderIndexByPackageId.set(order.packageId, order.orderIndex);
    }
  }

  const projects = assignments
    .map((assignment, index) => {
      const orderIndex = orderIndexByPackageId.get(assignment.reviewPackage.id) ?? index;
      const startAt = assignment.reviewPackage.startAt ?? guestToken.projectReviewStage.startAt ?? null;
      const deadline = assignment.reviewPackage.deadline ?? guestToken.projectReviewStage.deadline ?? null;
      const reviewWindowState = getExpertReviewWindowState({
        startAt,
        deadline,
        lockedAt: assignment.score?.lockedAt ?? null,
      });
      return {
        assignmentId: assignment.id,
        packageId: assignment.reviewPackage.id,
        orderIndex,
        orderNumber: orderIndex + 1,
        targetName: assignment.reviewPackage.targetName,
        roundLabel: assignment.reviewPackage.roundLabel ?? guestToken.projectReviewStage.name,
        overview: assignment.reviewPackage.overview ?? "",
        startAt: startAt?.toISOString() ?? null,
        deadline: deadline?.toISOString() ?? null,
        reviewWindowState: reviewWindowState.key,
        reviewWindowLabel: reviewWindowState.label,
        status: assignment.score ? "submitted" : assignment.status,
        scoreText: formatScore(assignment.score),
        submittedAt: assignment.score?.submittedAt.toISOString() ?? null,
        commentTotal: assignment.score?.commentTotal ?? "",
        materials: assignment.reviewPackage.materials.map((material) => ({
          id: material.id,
          kind: material.kind,
          name: material.name,
          fileName: material.fileName,
          fileSize: material.fileSize,
          mimeType: material.mimeType,
          uploadedAt: material.uploadedAt.toISOString(),
        })),
      };
    })
    .sort((left, right) => left.orderIndex - right.orderIndex || left.targetName.localeCompare(right.targetName, "zh-CN"));

  const submittedCount = projects.filter((project) => project.status === "submitted").length;
  const pendingCount = Math.max(0, projects.length - submittedCount);

  return NextResponse.json({
    expertName: guestToken.expertUser.name,
    stageName: guestToken.projectReviewStage.name,
    stageType: guestToken.projectReviewStage.type,
    tokenExpiresAt: guestToken.tokenExpiresAt.toISOString(),
    submittedCount,
    pendingCount,
    totalCount: projects.length,
    completionMessage: pendingCount === 0 && projects.length > 0 ? "感谢您的辛苦付出，所有项目评分已完成。" : null,
    projects,
  });
}
