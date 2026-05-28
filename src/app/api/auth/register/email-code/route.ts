import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { message: "暂不开放自助注册，请联系系统管理员或校级管理员开通账号" },
    { status: 403 },
  );
}
