import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  serializeDocument,
  statusValueToDb,
} from "@/lib/api-serializers";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  if (user.role !== "teacher") {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as
    | { status?: "已审核" | "需修改"; comment?: string }
    | null;

  const reviewStatus = body?.status;
  const status = reviewStatus ? statusValueToDb[reviewStatus] : null;
  if (!status || (reviewStatus !== "已审核" && reviewStatus !== "需修改")) {
    return NextResponse.json({ message: "审核状态无效" }, { status: 400 });
  }

  const document = await prisma.document.update({
    where: { id },
    data: {
      status,
      comment:
        body?.comment?.trim() ||
        (reviewStatus === "已审核"
          ? "指导教师已审核通过，可进入最终提交阶段。"
          : "指导教师要求修改，请根据批注重新上传版本。"),
    },
    include: {
      owner: {
        select: { id: true, name: true },
      },
      versions: {
        orderBy: { uploadedAt: "desc" },
        include: {
          uploader: {
            select: { name: true },
          },
        },
      },
    },
  });

  return NextResponse.json({ document: serializeDocument(document) });
}
