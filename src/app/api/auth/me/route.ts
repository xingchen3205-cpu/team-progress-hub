import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { serializeUserWithTeacherTrainingAccess } from "@/lib/teacher-training-access";

export async function GET(request: NextRequest) {
  const user = await getSessionUser(request);

  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  return NextResponse.json({ user: await serializeUserWithTeacherTrainingAccess(user) });
}
