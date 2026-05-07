import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import {
  getExpertReviewMode,
  getExpertReviewLockState,
  getExpertReviewWindowState,
  serializeExpertReviewAssignment,
} from "@/lib/expert-review";
import { assertRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, expertActionRateLimits, rateLimitExceededResponse } from "@/lib/security";

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
      teamGroupId: true,
      targetName: true,
      roundLabel: true,
      overview: true,
      status: true,
      startAt: true,
      deadline: true,
      dropHighestCount: true,
      dropLowestCount: true,
      projectReviewStage: {
        select: {
          id: true,
          type: true,
        },
      },
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
  displaySeats: {
    orderBy: { createdAt: "desc" },
    select: {
      status: true,
      session: {
        select: {
          status: true,
          startedAt: true,
          tokenExpiresAt: true,
          screenPhase: true,
          currentPackageId: true,
        },
      },
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

  const rateLimit = checkRateLimit(request, expertActionRateLimits.scoreSubmit, user.id);
  if (!rateLimit.allowed) {
    return rateLimitExceededResponse(rateLimit, "评分提交过于频繁，请稍后再试");
  }

  const body = (await request.json().catch(() => null)) as
    | {
        assignmentId?: string;
        totalScore?: number;
        roadshowScore?: number;
        scorePersonalGrowth?: number;
        scoreInnovation?: number;
        scoreIndustry?: number;
        scoreTeamwork?: number;
        commentTotal?: string;
      }
    | null;

  const assignmentId = body?.assignmentId?.trim();

  if (!assignmentId) {
    return NextResponse.json({ message: "评分信息不完整" }, { status: 400 });
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

  if (assignment.reviewPackage.status !== "configured") {
    return NextResponse.json({ message: "评审配置已取消，不能提交评分" }, { status: 409 });
  }

  if (assignment.score) {
    return NextResponse.json({ message: "评分已提交，不能修改" }, { status: 409 });
  }

  if (assignment.status === "closed_by_admin") {
    return NextResponse.json({ message: "本项目评分已由管理员关闭，无需提交" }, { status: 409 });
  }

  if (assignment.status === "timeout") {
    return NextResponse.json({ message: "本项目评分已超时关闭，不能提交" }, { status: 409 });
  }

  if (assignment.status === "excluded") {
    return NextResponse.json({ message: "该专家席位已被排除，不能提交评分" }, { status: 409 });
  }

  const isRoadshowAssignment = getExpertReviewMode(assignment.reviewPackage) === "roadshow";
  if (isRoadshowAssignment) {
    const startedScreenSeat = await prisma.reviewDisplaySeat.findFirst({
      where: {
        expertUserId: user.id,
        status: { notIn: ["excluded", "voided"] },
        session: {
          status: "scoring",
          screenPhase: "scoring",
          currentPackageId: assignment.reviewPackage.id,
          startedAt: {
            not: null,
          },
          tokenExpiresAt: {
            gt: new Date(),
          },
        },
      },
      select: { id: true },
    });

    if (!startedScreenSeat) {
      return NextResponse.json(
        { message: "现场评分尚未开始，请等待管理员在大屏控制端点击开始评分" },
        { status: 409 },
      );
    }
  }

  if (!isRoadshowAssignment) {
    const reviewWindowState = getExpertReviewWindowState({
      startAt: assignment.reviewPackage.startAt,
      deadline: assignment.reviewPackage.deadline,
      lockedAt: null,
    });

    if (reviewWindowState.key === "not_started") {
      return NextResponse.json({ message: "评审尚未开始，请在管理员设置的评审时间内提交" }, { status: 409 });
    }

    if (
      getExpertReviewLockState({
        deadline: assignment.reviewPackage.deadline,
        lockedAt: null,
      })
    ) {
      await prisma.expertReviewAssignment.update({
        where: { id: assignment.id },
        data: { status: "locked" },
      });

      return NextResponse.json({ message: "评审已截止，当前记录已锁定" }, { status: 409 });
    }
  }

  const commentTotal = body?.commentTotal?.trim() || "";
  const hasRoadshowScore = typeof body?.roadshowScore === "number";
  const hasTotalScore = typeof body?.totalScore === "number";
  const hasLegacyScore =
    typeof body?.scorePersonalGrowth === "number" ||
    typeof body?.scoreInnovation === "number" ||
    typeof body?.scoreIndustry === "number" ||
    typeof body?.scoreTeamwork === "number";

  let scorePayload: {
    scorePersonalGrowth: number;
    scoreInnovation: number;
    scoreIndustry: number;
    scoreTeamwork: number;
  };
  let totalScore: number;

  if (hasLegacyScore) {
    return NextResponse.json({ message: "请提交 0.00-100.00 的总分" }, { status: 400 });
  }

  if (hasRoadshowScore) {
    const roadshowScore = Number(body.roadshowScore);
    const scaledRoadshowScore = Math.round(roadshowScore * 100);
    const hasValidRoadshowPrecision =
      Number.isInteger(roadshowScore * 100) ||
      Math.abs(roadshowScore * 100 - scaledRoadshowScore) < 1e-6;
    if (
      !Number.isFinite(roadshowScore) ||
      roadshowScore < 0 ||
      roadshowScore > 100 ||
      !hasValidRoadshowPrecision
    ) {
      return NextResponse.json({ message: "路演分数需为 0.00-100.00，最多保留两位小数" }, { status: 400 });
    }

    scorePayload = {
      scorePersonalGrowth: 0,
      scoreInnovation: 0,
      scoreIndustry: 0,
      scoreTeamwork: 0,
    };
    totalScore = scaledRoadshowScore;
  } else if (hasTotalScore) {
    const simpleTotalScore = Number(body.totalScore);
    const scaledTotalScore = Math.round(simpleTotalScore * 100);
    const hasValidTotalPrecision =
      Number.isInteger(simpleTotalScore * 100) ||
      Math.abs(simpleTotalScore * 100 - scaledTotalScore) < 1e-6;
    if (
      !Number.isFinite(simpleTotalScore) ||
      simpleTotalScore < 0 ||
      simpleTotalScore > 100 ||
      !hasValidTotalPrecision
    ) {
      return NextResponse.json({ message: "网评分数需为 0.00-100.00，最多保留两位小数" }, { status: 400 });
    }

    scorePayload = {
      scorePersonalGrowth: 0,
      scoreInnovation: 0,
      scoreIndustry: 0,
      scoreTeamwork: 0,
    };
    totalScore = scaledTotalScore;
  } else {
    return NextResponse.json({ message: "评分信息不完整" }, { status: 400 });
  }

  const updatedAssignment = await prisma.$transaction(async (tx) => {
    const submittedAt = new Date();

    await tx.expertReviewScore.create({
      data: {
        assignmentId: assignment.id,
        reviewerId: user.id,
        ...scorePayload,
        totalScore,
        commentTotal: hasRoadshowScore ? "" : commentTotal,
        submittedAt,
        lockedAt: submittedAt,
      },
    });

    await tx.expertReviewAssignment.update({
      where: { id: assignment.id },
      data: { status: "submitted" },
    });

    await tx.reviewDisplaySeat.updateMany({
      where: {
        expertUserId: user.id,
        status: { notIn: ["excluded", "voided"] },
        session: {
          status: "scoring",
          currentPackageId: assignment.reviewPackage.id,
        },
      },
      data: { status: "submitted" },
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
