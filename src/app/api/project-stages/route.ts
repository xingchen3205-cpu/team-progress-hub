import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { assertMainWorkspaceRole } from "@/lib/permissions";

export const runtime = "nodejs";

const authorizeProjectStagesRequest = async (request: NextRequest) => {
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

export async function GET(request: NextRequest) {
  const unauthorizedResponse = await authorizeProjectStagesRequest(request);
  if (unauthorizedResponse) {
    return unauthorizedResponse;
  }

  return NextResponse.json({ message: "项目评审阶段列表接口待实现" }, { status: 501 });
}
