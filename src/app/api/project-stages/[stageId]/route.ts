import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { assertMainWorkspaceRole } from "@/lib/permissions";
import { canManageProjectReviewStage } from "@/lib/project-materials";

export const runtime = "nodejs";

const authorizeProjectStageRequest = async (request: NextRequest) => {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  try {
    assertMainWorkspaceRole(user.role);
  } catch {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  return null;
};

const authorizeProjectStageWriteRequest = async (request: NextRequest) => {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  if (!canManageProjectReviewStage(user.role)) {
    return NextResponse.json({ message: "无权限管理项目评审阶段" }, { status: 403 });
  }

  return null;
};

export async function GET(request: NextRequest) {
  const unauthorizedResponse = await authorizeProjectStageRequest(request);
  if (unauthorizedResponse) {
    return unauthorizedResponse;
  }

  return NextResponse.json({ message: "项目评审阶段详情接口待实现" }, { status: 501 });
}

export async function PATCH(request: NextRequest) {
  const unauthorizedResponse = await authorizeProjectStageWriteRequest(request);
  if (unauthorizedResponse) {
    return unauthorizedResponse;
  }

  return NextResponse.json({ message: "项目评审阶段更新接口待实现" }, { status: 501 });
}

export async function DELETE(request: NextRequest) {
  const unauthorizedResponse = await authorizeProjectStageWriteRequest(request);
  if (unauthorizedResponse) {
    return unauthorizedResponse;
  }

  return NextResponse.json({ message: "项目评审阶段删除接口待实现" }, { status: 501 });
}
