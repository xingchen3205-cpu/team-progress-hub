import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";

import { validateUsername } from "@/lib/account-policy";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { mergeTeacherTrainingParticipantExtraInfo } from "@/lib/teacher-training";
import { hasTeacherTrainingCohortManageAccess } from "@/lib/teacher-training-access";
import { deleteStoredFile } from "@/lib/uploads";

type TeacherTrainingParticipantInput = {
  cohortId?: string;
  name?: string;
  organization?: string;
  phone?: string;
  groupName?: string;
  title?: string;
  email?: string;
  gender?: string;
  age?: string;
  personnelCategory?: string;
  subject?: string;
  professionalTitle?: string;
  city?: string;
  arrivalTransportation?: string;
  arrivalAt?: string;
  arrivalVehicleNo?: string;
  arrivalDeparture?: string;
  extraInfo?: string;
  accountUsername?: string;
  accountPassword?: string;
  note?: string;
};

const getParticipantIdentityKey = (participant: { name: string; organization: string }) =>
  `${participant.name.trim()}@@${participant.organization.trim()}`.toLocaleLowerCase("zh-CN");

export async function POST(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | (TeacherTrainingParticipantInput & {
        participants?: TeacherTrainingParticipantInput[];
      })
    | null;

  if (Array.isArray(body?.participants)) {
    const cohortId = body?.cohortId?.trim();
    if (!cohortId) {
      return NextResponse.json({ message: "请先选择省培班次" }, { status: 400 });
    }
    const cohort = await prisma.teacherTrainingCohort.findFirst({
      where: { id: cohortId, deletedAt: null },
      select: { id: true },
    });
    if (!cohort) {
      return NextResponse.json({ message: "省培班次不存在" }, { status: 404 });
    }
    if (!(await hasTeacherTrainingCohortManageAccess(user, cohortId))) {
      return NextResponse.json({ message: "无权限维护该省培班次参训教师名单" }, { status: 403 });
    }

    const rows = body.participants.map((participant) => ({
      name: participant.name?.trim() ?? "",
      organization: participant.organization?.trim() ?? "",
      phone: participant.phone?.trim() || null,
      groupName: participant.groupName?.trim() || null,
      extraInfo: mergeTeacherTrainingParticipantExtraInfo(participant.extraInfo?.trim() || "", {
        title: participant.title?.trim() || "",
        email: participant.email?.trim() || "",
        gender: participant.gender?.trim() || "",
        age: participant.age?.trim() || "",
        personnelCategory: participant.personnelCategory?.trim() || "",
        subject: participant.subject?.trim() || "",
        professionalTitle: participant.professionalTitle?.trim() || "",
        city: participant.city?.trim() || "",
        arrivalTransportation: participant.arrivalTransportation?.trim() || "",
        arrivalAt: participant.arrivalAt?.trim() || "",
        arrivalVehicleNo: participant.arrivalVehicleNo?.trim() || "",
        arrivalDeparture: participant.arrivalDeparture?.trim() || "",
      }) || null,
      note: participant.note?.trim() || null,
    }));
    if (rows.length === 0 || rows.some((participant) => !participant.name || !participant.organization)) {
      return NextResponse.json({ message: "导入名单需包含姓名和单位" }, { status: 400 });
    }
    const importedParticipantKeys = rows.map(getParticipantIdentityKey);
    const duplicatedImportedParticipantKeys = importedParticipantKeys.filter(
      (key, index) => importedParticipantKeys.indexOf(key) !== index,
    );
    if (duplicatedImportedParticipantKeys.length > 0) {
      return NextResponse.json({ message: "名单中存在重复教师，请先合并后再导入" }, { status: 400 });
    }

    const importedPhones = rows.map((participant) => participant.phone).filter((phone): phone is string => Boolean(phone));
    const existingParticipants = await prisma.teacherTrainingParticipant.findMany({
      where: {
        cohortId,
        OR: [
          ...rows.map((participant) => ({
            name: participant.name,
            organization: participant.organization,
          })),
          ...(importedPhones.length ? [{ phone: { in: importedPhones } }] : []),
        ],
      },
      select: {
        id: true,
      },
    });
    if (existingParticipants.length > 0) {
      return NextResponse.json(
        { message: "该班次已存在相同姓名和单位或相同手机号的参训教师，请核对后再导入" },
        { status: 409 },
      );
    }

    await prisma.teacherTrainingParticipant.createMany({
      data: rows.map((participant) => ({
        cohortId,
        ...participant,
      })),
    });

    return NextResponse.json({ count: rows.length }, { status: 201 });
  }

  const cohortId = body?.cohortId?.trim();
  const name = body?.name?.trim();
  const organization = body?.organization?.trim();

  if (!cohortId || !name || !organization) {
    return NextResponse.json({ message: "请填写班次、姓名和单位" }, { status: 400 });
  }

  const cohort = await prisma.teacherTrainingCohort.findFirst({
    where: { id: cohortId, deletedAt: null },
    select: { id: true },
  });
  if (!cohort) {
    return NextResponse.json({ message: "省培班次不存在" }, { status: 404 });
  }
  if (!(await hasTeacherTrainingCohortManageAccess(user, cohortId))) {
    return NextResponse.json({ message: "无权限维护该省培班次参训教师名单" }, { status: 403 });
  }
  const existingParticipant = await prisma.teacherTrainingParticipant.findFirst({
    where: {
      cohortId,
      OR: [
        {
          name,
          organization,
        },
        ...(body?.phone?.trim() ? [{ phone: body.phone.trim() }] : []),
      ],
    },
    select: { id: true },
  });
  if (existingParticipant) {
    return NextResponse.json(
      { message: "该班次已存在相同姓名和单位或相同手机号的参训教师，请核对后再保存" },
      { status: 409 },
    );
  }

  const accountUsername = body?.accountUsername?.trim();
  const providedPassword = body?.accountPassword?.trim();
  let accountUserId: string | null = null;
  let temporaryPassword: string | null = null;

  if (accountUsername) {
    const usernameError = validateUsername(accountUsername);
    if (usernameError) {
      return NextResponse.json({ message: usernameError }, { status: 400 });
    }

    const existingAccount = await prisma.user.findFirst({
      where: {
        OR: [{ username: accountUsername }, { email: accountUsername }],
      },
      select: { id: true, role: true },
    });
    if (existingAccount) {
      if (existingAccount.role === "expert") {
        return NextResponse.json({ message: "评审专家账号不能绑定为省培参训教师" }, { status: 400 });
      }
      accountUserId = existingAccount.id;
    } else {
      temporaryPassword = providedPassword || "123456";
      const passwordHash = await bcrypt.hash(temporaryPassword, 10);
      const accountUser = await prisma.user.create({
        data: {
          name,
          username: accountUsername,
          email: null,
          password: passwordHash,
          role: "training_teacher",
          approvalStatus: "approved",
          approvedAt: new Date(),
          approvedById: user.id,
          avatar: name.slice(0, 1),
          avatarImagePath: null,
          responsibility: "江苏省职业院校创新创业教育（竞赛）指导能力提升培训参训教师",
        },
        select: {
          id: true,
        },
      });
      accountUserId = accountUser.id;
    }
  }

  const participant = await prisma.teacherTrainingParticipant.create({
    data: {
      cohortId,
      name,
      organization,
      phone: body?.phone?.trim() || null,
      groupName: body?.groupName?.trim() || null,
      accountUserId,
      extraInfo: mergeTeacherTrainingParticipantExtraInfo(body?.extraInfo?.trim() || "", {
        title: body?.title?.trim() || "",
        email: body?.email?.trim() || "",
        gender: body?.gender?.trim() || "",
        age: body?.age?.trim() || "",
        personnelCategory: body?.personnelCategory?.trim() || "",
        subject: body?.subject?.trim() || "",
        professionalTitle: body?.professionalTitle?.trim() || "",
        city: body?.city?.trim() || "",
        arrivalTransportation: body?.arrivalTransportation?.trim() || "",
        arrivalAt: body?.arrivalAt?.trim() || "",
        arrivalVehicleNo: body?.arrivalVehicleNo?.trim() || "",
        arrivalDeparture: body?.arrivalDeparture?.trim() || "",
      }) || null,
      note: body?.note?.trim() || null,
    },
  });

  return NextResponse.json({ participant, temporaryPassword }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { id?: string } | null;
  const participantId = body?.id?.trim();
  if (!participantId) {
    return NextResponse.json({ message: "请先选择要删除的参训教师" }, { status: 400 });
  }

  const participant = await prisma.teacherTrainingParticipant.findFirst({
    where: {
      id: participantId,
      cohort: {
        deletedAt: null,
      },
    },
    include: {
      accountUser: {
        select: {
          id: true,
          role: true,
          avatarImagePath: true,
        },
      },
    },
  });
  if (!participant) {
    return NextResponse.json({ message: "参训教师不存在" }, { status: 404 });
  }
  if (!(await hasTeacherTrainingCohortManageAccess(user, participant.cohortId))) {
    return NextResponse.json({ message: "无权限删除该省培班次参训教师" }, { status: 403 });
  }

  const accountUser = participant.accountUser;
  const shouldDeleteTrainingAccount = Boolean(accountUser && accountUser.role === "training_teacher");
  if (shouldDeleteTrainingAccount && accountUser?.id === user.id) {
    return NextResponse.json({ message: "不能删除当前登录账号绑定的参训教师" }, { status: 400 });
  }

  if (shouldDeleteTrainingAccount && accountUser) {
    const linkedParticipantCount = await prisma.teacherTrainingParticipant.count({
      where: {
        accountUserId: accountUser.id,
        id: {
          not: participant.id,
        },
      },
    });
    const blockingApprovalCount = linkedParticipantCount === 0
      ? await prisma.teacherTrainingLeaveApproval.count({
          where: { approverId: accountUser.id },
        })
      : 0;
    if (blockingApprovalCount > 0) {
      return NextResponse.json({ message: "该省培账号已有审批记录，不能随名单一起删除；请先解绑账号后再处理名单。" }, { status: 409 });
    }
  }

  let deletedTrainingAccount = false;
  let deletedAccountAvatarPath: string | null = null;

  await prisma.$transaction(async (tx) => {
    await tx.teacherTrainingParticipant.delete({
      where: { id: participant.id },
    });

    if (!shouldDeleteTrainingAccount || !accountUser) {
      return;
    }

    const remainingParticipantCount = await tx.teacherTrainingParticipant.count({
      where: { accountUserId: accountUser.id },
    });
    if (remainingParticipantCount > 0) {
      return;
    }

    await tx.teacherTrainingLeaveRequest.updateMany({
      where: { submittedById: accountUser.id },
      data: { submittedById: user.id },
    });
    await tx.teacherTrainingSubmission.updateMany({
      where: { submittedById: accountUser.id },
      data: { submittedById: user.id },
    });
    await tx.report.deleteMany({
      where: { userId: accountUser.id },
    });
    await tx.notification.deleteMany({
      where: { userId: accountUser.id },
    });
    await tx.notification.updateMany({
      where: { senderId: accountUser.id },
      data: { senderId: null },
    });
    await tx.user.updateMany({
      where: { approvedById: accountUser.id },
      data: { approvedById: null },
    });
    await tx.user.delete({
      where: { id: accountUser.id },
    });
    deletedTrainingAccount = true;
    deletedAccountAvatarPath = accountUser.avatarImagePath;
  });

  if (deletedAccountAvatarPath) {
    await deleteStoredFile(deletedAccountAvatarPath).catch(() => {});
  }

  return NextResponse.json({
    success: true,
    deletedAccount: deletedTrainingAccount,
  });
}
