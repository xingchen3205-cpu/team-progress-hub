import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getTokenFromCookieStore, verifyAuthToken } from "@/lib/auth";
import { formatBeijingDateTimeShort } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import { decodeTeacherTrainingAnnouncementDetail } from "@/lib/teacher-training-announcements";
import {
  hasTeacherTrainingCohortManageAccess,
  isTeacherTrainingSystemAdmin,
  type TeacherTrainingAccessUser,
} from "@/lib/teacher-training-access";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    announcementId: string;
  }>;
};

const getCurrentUser = async (): Promise<TeacherTrainingAccessUser | null> => {
  const token = await getTokenFromCookieStore();
  if (!token) {
    return null;
  }

  try {
    const payload = verifyAuthToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        role: true,
        approvalStatus: true,
      },
    });

    if (!user || user.approvalStatus !== "approved") {
      return null;
    }

    return user;
  } catch {
    return null;
  }
};

const canReadAnnouncement = async (user: TeacherTrainingAccessUser, cohortId: string) => {
  if (isTeacherTrainingSystemAdmin(user)) {
    return true;
  }

  if (await hasTeacherTrainingCohortManageAccess(user, cohortId)) {
    return true;
  }

  const participant = await prisma.teacherTrainingParticipant.findFirst({
    where: {
      accountUserId: user.id,
      cohortId,
      cohort: {
        deletedAt: null,
      },
    },
    select: {
      id: true,
    },
  });

  return Boolean(participant);
};

export default async function TeacherTrainingAnnouncementPage({ params }: PageProps) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const { announcementId } = await params;
  const announcement = await prisma.announcement.findUnique({
    where: { id: announcementId },
    include: {
      author: {
        select: {
          name: true,
        },
      },
    },
  });

  if (!announcement) {
    notFound();
  }

  const decoded = decodeTeacherTrainingAnnouncementDetail(announcement.detail);
  if (!decoded || !(await canReadAnnouncement(user, decoded.cohortId))) {
    notFound();
  }

  const cohort = await prisma.teacherTrainingCohort.findFirst({
    where: {
      id: decoded.cohortId,
      deletedAt: null,
    },
    select: {
      title: true,
      startDate: true,
      endDate: true,
      location: true,
    },
  });

  if (!cohort) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-[#f3f6fb] text-slate-900">
      <header className="border-b border-slate-200 bg-white/95">
        <div className="mx-auto flex min-h-[72px] max-w-6xl items-center justify-between gap-6 px-6">
          <div className="flex items-center gap-4">
            <div className="h-11 w-[250px]">
              <Image
                alt="南京铁道职业技术学院"
                className="h-full w-full object-contain"
                height={44}
                priority
                src="/official-logo.png"
                width={250}
              />
            </div>
            <div className="hidden h-7 w-px bg-slate-200 md:block" />
            <p className="hidden text-lg font-semibold text-slate-900 md:block">培训通知</p>
          </div>
          <Link
            className="rounded-md border border-blue-100 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 transition hover:border-blue-200 hover:bg-blue-100"
            href="/workspace?tab=teacherTraining"
          >
            返回省培系统
          </Link>
        </div>
      </header>

      <section className="border-b border-blue-100 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <p className="text-sm font-semibold text-blue-700">南京铁道职业技术学院教师培训管理系统</p>
          <h1 className="mt-4 text-3xl font-bold leading-tight text-slate-950">{announcement.title}</h1>
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-500">
            <span>发布人：{announcement.author.name}</span>
            <span>发布时间：{formatBeijingDateTimeShort(announcement.createdAt)}</span>
            <span>所属班次：{cohort.title}</span>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-8">
        <div className="rounded-lg border border-slate-200 bg-white px-10 py-10 shadow-sm">
          <div className="mb-8 rounded-md border border-blue-100 bg-blue-50/70 px-5 py-4 text-sm text-blue-950">
            <span className="font-semibold text-blue-950">培训班次：</span>
            {cohort.title}
            <span className="mx-3 text-blue-200">|</span>
            <span>{cohort.startDate} 至 {cohort.endDate}</span>
            {cohort.location ? (
              <>
                <span className="mx-3 text-blue-200">|</span>
                <span>{cohort.location}</span>
              </>
            ) : null}
          </div>
          <article className="prose prose-slate max-w-none whitespace-pre-wrap text-[17px] leading-9 text-slate-800">
            {decoded.detail}
          </article>
        </div>
      </section>
    </main>
  );
}
