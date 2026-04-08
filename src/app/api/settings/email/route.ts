import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import {
  getEmailReminderSettings,
  normalizeEmailReminderSettings,
  saveEmailReminderSettings,
} from "@/lib/email-settings";
import { assertRole } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  try {
    assertRole(user.role, ["admin"]);
  } catch {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const settings = await getEmailReminderSettings();
  return NextResponse.json({ settings });
}

export async function PATCH(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  try {
    assertRole(user.role, ["admin"]);
  } catch {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as Partial<
    Awaited<ReturnType<typeof getEmailReminderSettings>>
  > | null;
  const settings = normalizeEmailReminderSettings(body);
  const savedSettings = await saveEmailReminderSettings(settings);

  return NextResponse.json({ settings: savedSettings });
}
