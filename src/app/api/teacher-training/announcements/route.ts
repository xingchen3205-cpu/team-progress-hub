import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { createNotifications } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import {
  buildTeacherTrainingAnnouncementStoragePrefix,
  encodeTeacherTrainingAnnouncementDetail,
  serializeTeacherTrainingAnnouncement,
} from "@/lib/teacher-training-announcements";
import {
  hasTeacherTrainingCohortManageAccess,
  isTeacherTrainingSystemAdmin,
  type TeacherTrainingAccessUser,
} from "@/lib/teacher-training-access";

const canReadTeacherTrainingCohortAnnouncements = async (
  user: TeacherTrainingAccessUser,
  cohortId: string,
) => {
  if (isTeacherTrainingSystemAdmin(user)) {
    return true;
  }

  const cohort = await prisma.teacherTrainingCohort.findFirst({
    where: {
      id: cohortId,
      deletedAt: null,
      OR: [
        {
          managers: {
            some: {
              userId: user.id,
            },
          },
        },
        {
          participants: {
            some: {
              accountUserId: user.id,
            },
          },
        },
      ],
    },
    select: {
      id: true,
    },
  });

  return Boolean(cohort);
};

export async function GET(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const cohortId = request.nextUrl.searchParams.get("cohortId")?.trim() ?? "";
  if (!cohortId) {
    return NextResponse.json({ message: "请先选择省培班次" }, { status: 400 });
  }

  if (!(await canReadTeacherTrainingCohortAnnouncements(user, cohortId))) {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const announcements = await prisma.announcement.findMany({
    where: {
      detail: {
        startsWith: buildTeacherTrainingAnnouncementStoragePrefix(cohortId),
      },
    },
    orderBy: { createdAt: "desc" },
    include: {
      author: {
        select: { id: true, name: true, avatar: true },
      },
    },
  });

  return NextResponse.json({
    announcements: announcements.map(serializeTeacherTrainingAnnouncement),
  });
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { cohortId?: string; title?: string; detail?: string; notifyTeam?: boolean }
    | null;

  const cohortId = body?.cohortId?.trim() ?? "";
  const title = body?.title?.trim() ?? "";
  const detail = body?.detail?.trim() ?? "";

  if (!cohortId || !title || !detail) {
    return NextResponse.json({ message: "通知信息不完整" }, { status: 400 });
  }

  if (!(await hasTeacherTrainingCohortManageAccess(user, cohortId))) {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const cohort = await prisma.teacherTrainingCohort.findFirst({
    where: {
      id: cohortId,
      deletedAt: null,
    },
    select: {
      participants: {
        where: {
          accountUserId: {
            not: null,
          },
        },
        select: {
          accountUserId: true,
        },
      },
      managers: {
        select: {
          userId: true,
        },
      },
    },
  });

  if (!cohort) {
    return NextResponse.json({ message: "省培班次不存在" }, { status: 404 });
  }

  const announcement = await prisma.announcement.create({
    data: {
      title,
      detail: encodeTeacherTrainingAnnouncementDetail(cohortId, detail),
      authorId: user.id,
      teamGroupId: null,
    },
    include: {
      author: {
        select: { id: true, name: true, avatar: true },
      },
    },
  });

  if (body?.notifyTeam) {
    const recipientIds = [
      ...cohort.participants.map((participant) => participant.accountUserId),
      ...cohort.managers.map((manager) => manager.userId),
    ].filter((userId): userId is string => Boolean(userId && userId !== user.id));

    await createNotifications({
      userIds: recipientIds,
      title: `省培通知：${title}`,
      detail,
      type: "announcement",
      targetTab: "teacherTraining",
      relatedId: announcement.id,
      senderId: user.id,
    });
  }

  return NextResponse.json(
    { announcement: serializeTeacherTrainingAnnouncement(announcement) },
    { status: 201 },
  );
}
