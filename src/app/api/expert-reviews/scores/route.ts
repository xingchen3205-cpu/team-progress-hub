import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import {
  getExpertReviewLockState,
  serializeExpertReviewAssignment,
  validateExpertReviewScores,
} from "@/lib/expert-review";
import { assertRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const assignmentInclude = {
  expertUser: {
    select: {
      id: true,
      name: true,
      avatar: true,
      role: true,
    },
  },
  reviewPackage: {
    select: {
      id: true,
      targetName: true,
      roundLabel: true,
      overview: true,
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
  score: {
    select: {
      id: true,
      scorePersonalGrowth: true,
      scoreInnovation: true,
      scoreIndustry: true,
      scoreTeamwork: true,
      totalScore: true,
      commentTotal: true,
      submittedAt: true,
      updatedAt: true,
      lockedAt: true,
    },
  },
} as const;

export async function POST(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  try {
    assertRole(user.role, ["expert"]);
  } catch {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        assignmentId?: string;
        scorePersonalGrowth?: number;
        scoreInnovation?: number;
        scoreIndustry?: number;
        scoreTeamwork?: number;
        commentTotal?: string;
      }
    | null;

  const assignmentId = body?.assignmentId?.trim();
  const commentTotal = body?.commentTotal?.trim();
  const scorePayload = {
    scorePersonalGrowth: Number(body?.scorePersonalGrowth),
    scoreInnovation: Number(body?.scoreInnovation),
    scoreIndustry: Number(body?.scoreIndustry),
    scoreTeamwork: Number(body?.scoreTeamwork),
  };

  if (!assignmentId || !commentTotal) {
    return NextResponse.json({ message: "评分信息不完整" }, { status: 400 });
  }

  const validationError = validateExpertReviewScores(scorePayload);
  if (validationError) {
    return NextResponse.json({ message: validationError }, { status: 400 });
  }

  const assignment = await prisma.expertReviewAssignment.findUnique({
    where: { id: assignmentId },
    include: assignmentInclude,
  });

  if (!assignment) {
    return NextResponse.json({ message: "评审任务不存在" }, { status: 404 });
  }

  if (assignment.expertUserId !== user.id) {
    return NextResponse.json({ message: "无权限提交该评审任务" }, { status: 403 });
  }

  if (
    getExpertReviewLockState({
      deadline: assignment.reviewPackage.deadline,
      lockedAt: assignment.score?.lockedAt,
    })
  ) {
    await prisma.expertReviewAssignment.update({
      where: { id: assignment.id },
      data: { status: "locked" },
    });

    return NextResponse.json({ message: "评审已截止，当前记录已锁定" }, { status: 409 });
  }

  const totalScore =
    scorePayload.scorePersonalGrowth +
    scorePayload.scoreInnovation +
    scorePayload.scoreIndustry +
    scorePayload.scoreTeamwork;

  const updatedAssignment = await prisma.$transaction(async (tx) => {
    await tx.expertReviewScore.upsert({
      where: { assignmentId: assignment.id },
      update: {
        reviewerId: user.id,
        ...scorePayload,
        totalScore,
        commentTotal,
      },
      create: {
        assignmentId: assignment.id,
        reviewerId: user.id,
        ...scorePayload,
        totalScore,
        commentTotal,
      },
    });

    await tx.expertReviewAssignment.update({
      where: { id: assignment.id },
      data: { status: "completed" },
    });

    return tx.expertReviewAssignment.findUniqueOrThrow({
      where: { id: assignment.id },
      include: assignmentInclude,
    });
  });

  return NextResponse.json({
    assignment: serializeExpertReviewAssignment(updatedAssignment),
  });
}
