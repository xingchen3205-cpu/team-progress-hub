import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { canReviewProjectMaterial } from "@/lib/project-materials";

export const runtime = "nodejs";

const authorizeProjectMaterialApprovalRequest = async (request: NextRequest) => {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  if (
    !canReviewProjectMaterial({
      role: user.role,
      actorTeamGroupId: user.teamGroupId,
      materialTeamGroupId: user.teamGroupId ?? "",
    })
  ) {
    return NextResponse.json({ message: "无权限审批项目材料" }, { status: 403 });
  }

  return null;
};

export async function POST(request: NextRequest) {
  const unauthorizedResponse = await authorizeProjectMaterialApprovalRequest(request);
  if (unauthorizedResponse) {
    return unauthorizedResponse;
  }

  return NextResponse.json({ message: "项目材料审批通过接口待实现" }, { status: 501 });
}
