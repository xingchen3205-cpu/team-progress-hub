import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import {
  redactExpertReviewAssignmentForRole,
  serializeExpertReviewAssignment,
} from "@/lib/expert-review";
import { assertRole, hasGlobalAdminPrivileges } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { buildExpertReviewAssignmentVisibilityWhere } from "@/lib/team-scope";

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

export async function GET(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  try {
    assertRole(user.role, ["admin", "school_admin", "teacher", "leader", "member", "expert"]);
  } catch {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const assignments = await prisma.expertReviewAssignment.findMany({
    where: buildExpertReviewAssignmentVisibilityWhere(user),
    orderBy: [{ createdAt: "desc" }],
    include: assignmentInclude,
  });

  return NextResponse.json({
    assignments: assignments.map((assignment) =>
      redactExpertReviewAssignmentForRole(serializeExpertReviewAssignment(assignment), user.role),
    ),
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
        expertUserId?: string;
        targetName?: string;
        roundLabel?: string;
        overview?: string;
        deadline?: string;
      }
    | null;

  const expertUserId = body?.expertUserId?.trim();
  const targetName = body?.targetName?.trim();
  const roundLabel = body?.roundLabel?.trim() || null;
  const overview = body?.overview?.trim() || null;
  const deadline = body?.deadline ? new Date(body.deadline) : null;

  if (!expertUserId || !targetName) {
    return NextResponse.json({ message: "评审任务信息不完整" }, { status: 400 });
  }

  if (deadline && Number.isNaN(deadline.getTime())) {
    return NextResponse.json({ message: "截止时间格式无效" }, { status: 400 });
  }

  const expertUser = await prisma.user.findUnique({
    where: { id: expertUserId },
    select: { id: true, role: true },
  });

  if (!expertUser || expertUser.role !== "expert") {
    return NextResponse.json({ message: "请选择有效的评审专家账号" }, { status: 400 });
  }

  const assignment = await prisma.$transaction(async (tx) => {
    const reviewPackage = await tx.expertReviewPackage.create({
      data: {
        targetName,
        roundLabel,
        overview,
        deadline,
        createdById: user.id,
        teamGroupId: hasGlobalAdminPrivileges(user.role) ? null : user.teamGroupId,
      },
      select: { id: true },
    });

    return tx.expertReviewAssignment.create({
      data: {
        packageId: reviewPackage.id,
        expertUserId,
      },
      include: assignmentInclude,
    });
  });

  return NextResponse.json(
    {
      assignment: redactExpertReviewAssignmentForRole(
        serializeExpertReviewAssignment(assignment),
        user.role,
      ),
    },
    { status: 201 },
  );
}
