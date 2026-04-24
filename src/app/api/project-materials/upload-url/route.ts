import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { canUploadProjectMaterial } from "@/lib/project-materials";

export const runtime = "nodejs";

const authorizeProjectMaterialUploadRequest = async (request: NextRequest) => {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  if (!canUploadProjectMaterial({ role: user.role, teamGroupId: user.teamGroupId })) {
    return NextResponse.json({ message: "无权限上传项目材料" }, { status: 403 });
  }

  return null;
};

export async function POST(request: NextRequest) {
  const unauthorizedResponse = await authorizeProjectMaterialUploadRequest(request);
  if (unauthorizedResponse) {
    return unauthorizedResponse;
  }

  return NextResponse.json({ message: "项目材料上传地址接口待实现" }, { status: 501 });
}
