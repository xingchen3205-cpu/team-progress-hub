import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { buildInlineDisposition } from "@/lib/downloads";
import { getExpertReviewLockState, getExpertReviewWindowState } from "@/lib/expert-review";
import { assertRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { canAccessTeamScopedResource } from "@/lib/team-scope";
import { readStoredFile, readStoredFileRange } from "@/lib/uploads";

export const runtime = "nodejs";

const parseHttpRange = (rangeHeader: string | null, fileSize: number) => {
  if (!rangeHeader) {
    return null;
  }

  const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) {
    return "invalid" as const;
  }

  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) {
    return "invalid" as const;
  }

  if (!rawStart) {
    const suffixLength = Number(rawEnd);
    if (!Number.isInteger(suffixLength) || suffixLength <= 0) {
      return "invalid" as const;
    }

    const start = Math.max(fileSize - suffixLength, 0);
    return { start, end: fileSize - 1 };
  }

  const start = Number(rawStart);
  const end = rawEnd ? Number(rawEnd) : fileSize - 1;
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end < start ||
    start >= fileSize
  ) {
    return "invalid" as const;
  }

  return { start, end: Math.min(end, fileSize - 1) };
};

export async function GET(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ id: string; kind: string }>;
  },
) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const { id, kind } = await params;

  try {
    assertRole(user.role, ["admin", "school_admin", "teacher", "leader", "expert"]);
  } catch {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  if (!["plan", "ppt", "video"].includes(kind)) {
    return NextResponse.json({ message: "材料类型无效" }, { status: 400 });
  }

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

  if (assignment.reviewPackage.status !== "configured") {
    return NextResponse.json({ message: "评审配置已取消，材料查看权限已关闭" }, { status: 410 });
  }

  if (user.role === "expert" && assignment.expertUserId !== user.id) {
    return NextResponse.json({ message: "无权限查看该材料" }, { status: 403 });
  }

  if (
    user.role === "expert" &&
    getExpertReviewWindowState({
      startAt: assignment.reviewPackage.startAt,
      deadline: assignment.reviewPackage.deadline,
    }).key === "not_started"
  ) {
    return NextResponse.json({ message: "评审尚未开始，材料查看权限暂未开放" }, { status: 409 });
  }

  if (
    user.role === "expert" &&
    getExpertReviewLockState({ deadline: assignment.reviewPackage.deadline })
  ) {
    return NextResponse.json({ message: "评审已截止，材料查看权限已关闭" }, { status: 410 });
  }

  if (
    user.role !== "expert" &&
    !canAccessTeamScopedResource(
      user,
      {
        ownerId: assignment.reviewPackage.createdById,
        teamGroupId: assignment.reviewPackage.teamGroupId,
      },
      { allowUnassignedForGroupedUsers: true },
    )
  ) {
    return NextResponse.json({ message: "无权限查看该材料" }, { status: 403 });
  }

  const material = assignment.reviewPackage.materials.find((item) => item.kind === kind);
  if (!material) {
    return NextResponse.json({ message: "材料不存在" }, { status: 404 });
  }

  try {
    const range = parseHttpRange(request.headers.get("range"), material.fileSize);
    if (range === "invalid") {
      return new NextResponse(null, {
        status: 416,
        headers: {
          "Content-Range": `bytes */${material.fileSize}`,
          "Accept-Ranges": "bytes",
        },
      });
    }

    if (range) {
      const buffer = await readStoredFileRange({
        objectKey: material.filePath,
        start: range.start,
        end: range.end,
      });

      return new NextResponse(buffer, {
        status: 206,
        headers: {
          "Content-Type": material.mimeType || "application/octet-stream",
          "Content-Disposition": buildInlineDisposition(material.fileName),
          "Content-Length": String(buffer.length),
          "Content-Range": `bytes ${range.start}-${range.end}/${material.fileSize}`,
          "Accept-Ranges": "bytes",
        },
      });
    }

    const fileData = await readStoredFile(material.filePath);

    return new NextResponse(fileData.buffer, {
      headers: {
        "Content-Type": fileData.contentType || material.mimeType || "application/octet-stream",
        "Content-Disposition": buildInlineDisposition(material.fileName),
        "Content-Length": String(material.fileSize),
        "Accept-Ranges": "bytes",
      },
    });
  } catch {
    return NextResponse.json({ message: "材料文件不存在或已丢失" }, { status: 404 });
  }
}
