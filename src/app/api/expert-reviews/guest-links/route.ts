import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import {
  createExpertReviewGuestToken,
  getDefaultExpertReviewGuestTokenExpiresAt,
} from "@/lib/expert-review-guest-token";
import { assertRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const getExpertAssignmentsForStage = async (projectReviewStageId: string, expertUserIds?: string[]) =>
  prisma.expertReviewAssignment.findMany({
    where: {
      expertUserId: expertUserIds?.length ? { in: expertUserIds } : undefined,
      reviewPackage: {
        projectReviewStageId,
        status: "configured",
      },
    },
    select: {
      expertUserId: true,
      expertUser: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

const buildAssignmentCounts = (
  assignments: Awaited<ReturnType<typeof getExpertAssignmentsForStage>>,
) => {
  const expertMap = new Map<string, { expertUserId: string; expertName: string; expertEmail: string | null; assignmentCount: number }>();
  for (const assignment of assignments) {
    const current = expertMap.get(assignment.expertUserId);
    expertMap.set(assignment.expertUserId, {
      expertUserId: assignment.expertUserId,
      expertName: assignment.expertUser.name,
      expertEmail: assignment.expertUser.email,
      assignmentCount: (current?.assignmentCount ?? 0) + 1,
    });
  }
  return [...expertMap.values()].sort((left, right) => left.expertName.localeCompare(right.expertName, "zh-CN"));
};

export async function GET(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  try {
    assertRole(user.role, ["admin", "school_admin"]);
  } catch {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const projectReviewStageId = request.nextUrl.searchParams.get("projectReviewStageId")?.trim();
  if (!projectReviewStageId) {
    return NextResponse.json({ message: "缺少评审轮次" }, { status: 400 });
  }

  const assignments = await getExpertAssignmentsForStage(projectReviewStageId);
  const assignmentCounts = new Map(buildAssignmentCounts(assignments).map((item) => [item.expertUserId, item]));
  const tokens = await prisma.expertReviewGuestToken.findMany({
    where: { projectReviewStageId },
    orderBy: { createdAt: "desc" },
    select: {
      expertUserId: true,
      tokenExpiresAt: true,
      revokedAt: true,
      lastUsedAt: true,
      updatedAt: true,
      expertUser: {
        select: {
          name: true,
          email: true,
        },
      },
    },
  });

  return NextResponse.json({
    links: tokens.map((token) => ({
      expertUserId: token.expertUserId,
      expertName: token.expertUser.name,
      expertEmail: token.expertUser.email,
      assignmentCount: assignmentCounts.get(token.expertUserId)?.assignmentCount ?? 0,
      tokenExpiresAt: token.tokenExpiresAt.toISOString(),
      revokedAt: token.revokedAt?.toISOString() ?? null,
      lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
      updatedAt: token.updatedAt.toISOString(),
    })),
  });
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  try {
    assertRole(user.role, ["admin", "school_admin"]);
  } catch {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        projectReviewStageId?: string;
        expertUserIds?: string[];
        tokenExpiresAt?: string;
      }
    | null;
  const projectReviewStageId = body?.projectReviewStageId?.trim();
  if (!projectReviewStageId) {
    return NextResponse.json({ message: "缺少评审轮次" }, { status: 400 });
  }

  const expertUserIds = Array.isArray(body?.expertUserIds)
    ? [...new Set(body.expertUserIds.filter((id): id is string => typeof id === "string" && Boolean(id.trim())).map((id) => id.trim()))]
    : undefined;

  const stage = await prisma.projectReviewStage.findUnique({
    where: { id: projectReviewStageId },
    select: {
      id: true,
      name: true,
      deadline: true,
    },
  });
  if (!stage) {
    return NextResponse.json({ message: "评审轮次不存在" }, { status: 404 });
  }

  const assignments = await getExpertAssignmentsForStage(projectReviewStageId, expertUserIds);
  const experts = buildAssignmentCounts(assignments);
  if (!experts.length) {
    return NextResponse.json({ message: "当前轮次没有可生成链接的专家任务" }, { status: 400 });
  }

  const requestedExpiresAt = body?.tokenExpiresAt ? new Date(body.tokenExpiresAt) : null;
  const tokenExpiresAt =
    requestedExpiresAt && !Number.isNaN(requestedExpiresAt.getTime())
      ? requestedExpiresAt
      : getDefaultExpertReviewGuestTokenExpiresAt(stage.deadline);
  const origin = request.nextUrl.origin;

  const links = await prisma.$transaction(async (tx) => {
    const generated = [];
    for (const expert of experts) {
      const { token, tokenHash } = createExpertReviewGuestToken();
      const record = await tx.expertReviewGuestToken.upsert({
        where: {
          expertUserId_projectReviewStageId: {
            expertUserId: expert.expertUserId,
            projectReviewStageId,
          },
        },
        create: {
          expertUserId: expert.expertUserId,
          projectReviewStageId,
          tokenHash,
          tokenExpiresAt,
          createdById: user.id,
        },
        update: {
          tokenHash,
          tokenExpiresAt,
          revokedAt: null,
          lastUsedAt: null,
          createdById: user.id,
        },
        select: {
          expertUserId: true,
          tokenExpiresAt: true,
        },
      });
      const url = new URL(`/expert-review/guest/${token}`, origin);
      generated.push({
        expertUserId: record.expertUserId,
        expertName: expert.expertName,
        expertEmail: expert.expertEmail,
        assignmentCount: expert.assignmentCount,
        tokenExpiresAt: record.tokenExpiresAt.toISOString(),
        url: url.toString(),
      });
    }
    return generated;
  });

  return NextResponse.json({
    projectReviewStageId,
    stageName: stage.name,
    links,
  });
}
