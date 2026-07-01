import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";

import { validatePasswordPolicy, validateRequiredEmail } from "@/lib/account-policy";
import { getSessionUser } from "@/lib/auth";
import { buildAppUrl, isEmailConfigured, renderSystemEmail, sendEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { isTeacherTrainingArrivalAtValue, mergeTeacherTrainingParticipantExtraInfo } from "@/lib/teacher-training";

const teacherTrainingPhonePattern = /^1[3-9]\d{9}$/;

export async function PATCH(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        participantId?: string;
        name?: string;
        organization?: string;
        phone?: string;
        groupName?: string;
        title?: string;
        email?: string;
        arrivalTransportation?: string;
        arrivalAt?: string;
        arrivalVehicleNo?: string;
        arrivalDeparture?: string;
        password?: string;
        note?: string;
      }
    | null;
  const participantId = body?.participantId?.trim();
  const name = body?.name?.trim();
  const organization = body?.organization?.trim();
  const phone = body?.phone?.trim() || "";
  const groupName = body?.groupName?.trim() || "";
  const title = body?.title?.trim() || "";
  const email = body?.email?.trim() || "";
  const arrivalTransportation = body?.arrivalTransportation?.trim() || "";
  const arrivalAt = body?.arrivalAt?.trim() || "";
  const arrivalVehicleNo = body?.arrivalVehicleNo?.trim() || "";
  const arrivalDeparture = body?.arrivalDeparture?.trim() || "";
  const password = body?.password?.trim() || "";
  const passwordChangeRequired = user.role === "training_teacher" && !user.email;

  if (
    !participantId ||
    !name ||
    !organization ||
    !phone ||
    !groupName ||
    !title ||
    !email
  ) {
    return NextResponse.json(
      { message: "请填写姓名、单位、手机、分组、职务和邮箱" },
      { status: 400 },
    );
  }
  const emailError = validateRequiredEmail(email);
  if (emailError) {
    return NextResponse.json({ message: emailError }, { status: 400 });
  }
  if (!teacherTrainingPhonePattern.test(phone)) {
    return NextResponse.json({ message: "手机号格式不正确，请填写 11 位中国大陆手机号" }, { status: 400 });
  }
  if (arrivalAt && !isTeacherTrainingArrivalAtValue(arrivalAt)) {
    return NextResponse.json({ message: "预计到达时间格式不正确" }, { status: 400 });
  }
  if (passwordChangeRequired && !password) {
    return NextResponse.json({ message: "首次登录必须修改初始密码" }, { status: 400 });
  }
  if (password === "123456") {
    return NextResponse.json({ message: "不能继续使用初始密码 123456" }, { status: 400 });
  }
  const emailConflict = await prisma.user.findFirst({
    where: {
      id: { not: user.id },
      OR: [{ email }, { username: email }],
    },
    select: { id: true },
  });
  if (emailConflict) {
    return NextResponse.json({ message: "邮箱已被其他账号使用，请更换后再保存" }, { status: 409 });
  }

  const participant = await prisma.teacherTrainingParticipant.findFirst({
    where: {
      id: participantId,
      accountUserId: user.id,
      cohort: {
        deletedAt: null,
      },
    },
    select: {
      id: true,
      accountUserId: true,
      phone: true,
      extraInfo: true,
      cohort: {
        select: {
          title: true,
        },
      },
    },
  });
  if (!participant) {
    return NextResponse.json({ message: "未找到当前省培账号对应的参训档案" }, { status: 404 });
  }
  const shouldSyncPhoneUsername =
    user.role === "training_teacher" &&
    user.username === (participant.phone ?? "").trim() &&
    phone !== user.username;
  if (shouldSyncPhoneUsername) {
    const usernameConflict = await prisma.user.findFirst({
      where: {
        id: { not: user.id },
        username: phone,
      },
      select: { id: true },
    });
    if (usernameConflict) {
      return NextResponse.json({ message: "该手机号已被其他账号使用，请更换后再保存" }, { status: 409 });
    }
  }
  if (password) {
    const passwordError = validatePasswordPolicy(password, {
      username: user.username,
      phone,
      disallowDefaultPassword: true,
    });
    if (passwordError) {
      return NextResponse.json({ message: passwordError }, { status: 400 });
    }
  }

  const emailChanged = Boolean(email && email !== (user.email ?? ""));
  let emailStatus: "unchanged" | "not_configured" | "sent" | "failed" = emailChanged ? "not_configured" : "unchanged";
  const passwordHash = password ? await bcrypt.hash(password, 10) : undefined;

  await prisma.$transaction([
    prisma.teacherTrainingParticipant.update({
      where: { id: participant.id },
      data: {
        name,
        organization,
        phone,
        groupName,
        extraInfo: mergeTeacherTrainingParticipantExtraInfo(participant.extraInfo, {
          title,
          email,
          arrivalTransportation,
          arrivalAt,
          arrivalVehicleNo,
          arrivalDeparture,
        }) || null,
        note: body?.note?.trim() || null,
      },
    }),
    prisma.user.update({
      where: { id: user.id },
      data: {
        name,
        phone,
        ...(shouldSyncPhoneUsername ? { username: phone } : {}),
        email,
        password: passwordHash,
        avatar: name.slice(0, 1),
      },
    }),
  ]);

  if (emailChanged && isEmailConfigured()) {
    try {
      await sendEmail({
        to: email,
        subject: "省培资料已完善",
        html: renderSystemEmail({
          title: "省培资料已完善",
          detail: `你已完成${participant.cohort.title}的省培个人资料填写。\n请及时修改初始密码，并按平台提示完成报到、签到、任务汇报和请假等事项。`,
          actionUrl: buildAppUrl("/workspace?tab=teacherTraining"),
          actionLabel: "进入省培系统",
          recipientName: name,
          noticeType: "省培账号",
        }),
      });
      emailStatus = "sent";
    } catch (error) {
      emailStatus = "failed";
      console.error("Teacher training profile completion email failed", error);
      void prisma.auditLog.create({
        data: {
          operatorId: user.id,
          operatorRole: user.role,
          action: "teacher_training.notification.failed",
          objectType: "teacher_training_profile",
          objectId: participant.id,
          metadata: JSON.stringify({ stage: "profile", message: error instanceof Error ? error.message : String(error) }),
        },
      }).catch(() => undefined);
    }
  }

  return NextResponse.json({ ok: true, emailStatus });
}
