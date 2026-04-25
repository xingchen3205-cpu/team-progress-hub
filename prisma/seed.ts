import path from "node:path";

import { PrismaLibSQL } from "@prisma/adapter-libsql";
import bcrypt from "bcryptjs";
import { config as loadEnv } from "dotenv";
import {
  DocumentCategory,
  DocumentStatus,
  PrismaClient,
  Role,
  TaskPriority,
} from "@prisma/client";

import {
  initialAnnouncements,
  initialBoardTasks,
  initialDocuments,
  initialEvents,
  initialExpertSessions,
  reportEntriesByDate,
  teamMembers,
} from "../src/data/demo-data";

loadEnv({ path: path.join(process.cwd(), ".env.local") });
loadEnv();

const adapter = new PrismaLibSQL({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});
const prisma = new PrismaClient({ adapter });

const roleMap = {
  系统管理员: Role.admin,
  校级管理员: Role.school_admin,
  指导教师: Role.teacher,
  项目负责人: Role.leader,
  团队成员: Role.member,
  评审专家: Role.expert,
} as const satisfies Record<string, Role>;

const taskPriorityMap = {
  高优先级: TaskPriority.high,
  中优先级: TaskPriority.medium,
  低优先级: TaskPriority.low,
  进行中: TaskPriority.high,
  已完成: TaskPriority.high,
  待验收: TaskPriority.high,
  已归档: TaskPriority.high,
} as const satisfies Record<string, TaskPriority>;

const documentCategoryMap = {
  计划书: DocumentCategory.plan,
  PPT: DocumentCategory.ppt,
  答辩材料: DocumentCategory.defense,
  证明附件: DocumentCategory.proof,
} as const satisfies Record<string, DocumentCategory>;

const documentStatusMap = {
  待负责人审批: DocumentStatus.pending,
  待教师终审: DocumentStatus.leader_approved,
  终审通过: DocumentStatus.approved,
  负责人打回: DocumentStatus.leader_revision,
  教师打回: DocumentStatus.revision,
} as const satisfies Record<string, DocumentStatus>;

const uploadFolderByCategory = {
  计划书: "plans",
  PPT: "ppt",
  答辩材料: "defense",
  证明附件: "proof",
} as const;

async function main() {
  await prisma.reviewDisplaySeat.deleteMany();
  await prisma.reviewDisplaySession.deleteMany();
  await prisma.expertReviewScore.deleteMany();
  await prisma.expertReviewMaterial.deleteMany();
  await prisma.expertReviewAssignment.deleteMany();
  await prisma.expertReviewPackage.deleteMany();
  await prisma.notification.deleteMany();
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
      id: "admin-1",
      name: "系统管理员",
      username: "jiayingze",
      email: null,
      password: "jyz760309",
      role: Role.admin,
      avatar: "管",
      responsibility: "系统最高权限管理、账号与权限配置、全局运维",
    },
    {
      id: "teacher-1",
      name: "李老师",
      username: "teacher",
      email: "teacher@competition.cn",
      password: "teacher123",
      role: Role.teacher,
      avatar: "李",
      responsibility: "把关方向、审核文档、发布公告和校内资源协调",
    },
    {
      id: "leader-1",
      name: "陈思远",
      username: "captain",
      email: "captain@competition.cn",
      password: "leader123",
      role: Role.leader,
      avatar: "陈",
      responsibility: "整体统筹、路演主线、答辩分工、任务推进",
    },
    {
      id: "member-1",
      name: "林沐晴",
      username: "member",
      email: "member@competition.cn",
      password: "member123",
      role: Role.member,
      avatar: "林",
      responsibility: "市场规模、用户访谈、竞品分析",
    },
    {
      id: "expert-1",
      name: "王评委",
      username: "expertjudge",
      email: "expertjudge@competition.cn",
      password: "expert123",
      role: Role.expert,
      avatar: "王",
      responsibility: "职教赛道创业组专家评审",
    },
    {
      id: "expert-2",
      name: "周评委",
      username: "reviewzhou",
      email: "reviewzhou@competition.cn",
      password: "expert123",
      role: Role.expert,
      avatar: "周",
      responsibility: "职教赛道创业组专家评审",
    },
    ...teamMembers
      .filter((member) => !["teacher-1", "leader-1", "member-1"].includes(member.id))
      .map((member) => ({
        id: member.id,
        name: member.name,
        username: member.account.split("@")[0],
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
        approvalStatus: "approved",
        approvedAt: new Date(),
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
      creatorId: "teacher-1",
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
      createdById: "teacher-1",
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
            fileName: version.fileName || `${document.name}-${version.version}.pdf`,
            filePath:
              version.filePath ||
              `${
                uploadFolderByCategory[document.category as keyof typeof uploadFolderByCategory]
              }/${document.name}-${version.version}.pdf`,
            fileSize: version.fileSize || 1024,
            mimeType: version.mimeType || "application/pdf",
          })),
        },
      },
    });
  }

  const seededReviewDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await prisma.expertReviewPackage.create({
    data: {
      id: "review-package-1",
      targetName: "星辰智造服务项目",
      roundLabel: "校内专家预审",
      overview:
        "请结合计划书、路演材料与演示视频，对项目成长性、创新性与产业价值进行独立评分。",
      deadline: seededReviewDeadline,
      createdById: "admin-1",
      assignments: {
        create: [
          {
            id: "review-assignment-1",
            expertUserId: "expert-1",
            status: "completed",
          },
          {
            id: "review-assignment-2",
            expertUserId: "expert-2",
            status: "pending",
          },
        ],
      },
      materials: {
        create: [
          {
            kind: "plan",
            name: "专家评审版计划书",
            fileName: "expert-review-plan.pdf",
            filePath: "expert-review/expert-review-plan.pdf",
            fileSize: 1024,
            mimeType: "application/pdf",
          },
          {
            kind: "ppt",
            name: "专家评审版路演材料",
            fileName: "expert-review-ppt.pdf",
            filePath: "expert-review/expert-review-ppt.pdf",
            fileSize: 1024,
            mimeType: "application/pdf",
          },
          {
            kind: "video",
            name: "项目演示视频",
            fileName: "expert-review-video.mp4",
            filePath: "expert-review/expert-review-video.mp4",
            fileSize: 1024,
            mimeType: "video/mp4",
          },
        ],
      },
    },
  });

  await prisma.expertReviewScore.create({
    data: {
      assignmentId: "review-assignment-1",
      reviewerId: "expert-1",
      scorePersonalGrowth: 22,
      scoreInnovation: 26,
      scoreIndustry: 25,
      scoreTeamwork: 13,
      totalScore: 86,
      commentTotal:
        "项目逻辑清晰，产业场景扎实，建议在商业模式页进一步补强盈利闭环与推广路径。",
      submittedAt: new Date("2026-04-06T11:20:00+08:00"),
    },
  });

  await prisma.notification.createMany({
    data: [
      {
        userId: "leader-1",
        documentId: "doc-1",
        title: "文档待负责人审批",
        detail: "林沐晴上传了《商业计划书》新版本，请及时处理。",
        type: "document_review",
        targetTab: "documents",
        relatedId: "doc-1",
        isRead: false,
      },
      {
        userId: "teacher-1",
        documentId: "doc-1",
        title: "文档待教师终审",
        detail: "项目负责人已完成《商业计划书》初审，请安排终审。",
        type: "document_review",
        targetTab: "documents",
        relatedId: "doc-1",
        isRead: false,
      },
    ],
  });

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
