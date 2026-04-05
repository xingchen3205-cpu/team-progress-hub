import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

import {
  initialAnnouncements,
  initialBoardTasks,
  initialDocuments,
  initialEvents,
  initialExpertSessions,
  reportEntriesByDate,
  teamMembers,
} from "../src/data/demo-data";

const prisma = new PrismaClient();

const roleMap = {
  指导教师: "teacher",
  项目负责人: "leader",
  团队成员: "member",
} as const;

const taskPriorityMap = {
  高优先级: "high",
  中优先级: "medium",
  低优先级: "low",
  进行中: "high",
  已完成: "high",
} as const;

const documentCategoryMap = {
  计划书: "plan",
  PPT: "ppt",
  答辩材料: "defense",
  证明附件: "proof",
} as const;

const documentStatusMap = {
  待审核: "pending",
  已审核: "approved",
  需修改: "revision",
} as const;

async function main() {
  await prisma.documentVersion.deleteMany();
  await prisma.document.deleteMany();
  await prisma.expertFeedback.deleteMany();
  await prisma.report.deleteMany();
  await prisma.task.deleteMany();
  await prisma.event.deleteMany();
  await prisma.announcement.deleteMany();
  await prisma.user.deleteMany();

  const users = [
    {
      id: "teacher-1",
      name: "李老师",
      email: "teacher@competition.cn",
      password: "teacher123",
      role: "teacher" as const,
      avatar: "李",
      responsibility: "把关方向、审核文档、发布公告和校内资源协调",
    },
    {
      id: "leader-1",
      name: "陈思远",
      email: "captain@competition.cn",
      password: "leader123",
      role: "leader" as const,
      avatar: "陈",
      responsibility: "整体统筹、路演主线、答辩分工、任务推进",
    },
    {
      id: "member-1",
      name: "林沐晴",
      email: "member@competition.cn",
      password: "member123",
      role: "member" as const,
      avatar: "林",
      responsibility: "市场规模、用户访谈、竞品分析",
    },
    ...teamMembers
      .filter((member) => !["teacher-1", "leader-1", "member-1"].includes(member.id))
      .map((member) => ({
        id: member.id,
        name: member.name,
        email: member.account,
        password: "123456",
        role: roleMap[member.systemRole],
        avatar: member.avatar,
        responsibility: member.responsibility,
      })),
  ];

  for (const user of users) {
    await prisma.user.create({
      data: {
        ...user,
        password: await bcrypt.hash(user.password, 10),
      },
    });
  }

  const nameToUserId = new Map(users.map((user) => [user.name, user.id]));

  await prisma.announcement.createMany({
    data: initialAnnouncements.map((item, index) => ({
      id: item.id,
      title: item.title,
      detail: item.detail,
      authorId: index === 0 ? "teacher-1" : "leader-1",
      createdAt: new Date(Date.UTC(2026, 3, 5 - index, 8, 0)),
    })),
  });

  await prisma.event.createMany({
    data: initialEvents.map((item) => ({
      id: item.id,
      title: item.title,
      dateTime: new Date(item.dateTime),
      type: item.type,
      description: item.description,
    })),
  });

  await prisma.task.createMany({
    data: initialBoardTasks.map((item) => ({
      id: item.id,
      title: item.title,
      status: item.status,
      priority: taskPriorityMap[item.priority],
      assigneeId: item.assigneeId,
      creatorId: "leader-1",
      dueDate: new Date(item.dueDate.replace(" ", "T") + ":00+08:00"),
    })),
  });

  for (const [date, reports] of Object.entries(reportEntriesByDate)) {
    for (const report of reports) {
      await prisma.report.create({
        data: {
          userId: report.memberId,
          date,
          summary: report.summary,
          nextPlan: report.nextPlan,
          attachment: report.attachment,
          submittedAt: new Date(`${date}T${report.submittedAt}:00+08:00`),
        },
      });
    }
  }

  await prisma.expertFeedback.createMany({
    data: initialExpertSessions.map((item) => ({
      id: item.id,
      date: item.date,
      expert: item.expert,
      topic: item.topic,
      format: item.format,
      summary: item.summary,
      nextAction: item.nextAction,
      attachments: JSON.stringify(item.attachments),
    })),
  });

  for (const document of initialDocuments) {
    await prisma.document.create({
      data: {
        id: document.id,
        name: document.name,
        category:
          documentCategoryMap[document.category as keyof typeof documentCategoryMap],
        ownerId: document.ownerId,
        status: documentStatusMap[document.status as keyof typeof documentStatusMap],
        comment: document.comment,
        currentVersion: document.currentVersion,
        versions: {
          create: document.versions.map((version) => ({
            version: version.version,
            uploadedAt: new Date(version.uploadedAt.replace(" ", "T") + ":00+08:00"),
            uploaderId: nameToUserId.get(version.uploader) ?? document.ownerId,
            note: version.note,
          })),
        },
      },
    });
  }

  console.log("Database seeded successfully.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
