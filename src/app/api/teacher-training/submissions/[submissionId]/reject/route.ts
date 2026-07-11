import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { createAuditLogEntry } from "@/lib/audit-log";
import { createNotifications } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { hasTeacherTrainingCohortManageAccess } from "@/lib/teacher-training-access";
import {
  parseTeacherTrainingParticipantExtraInfo,
  serializeTeacherTrainingSubmission,
} from "@/lib/teacher-training";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ submissionId: string }>;
};

const submissionInclude = {
  participant: {
    select: {
      name: true,
    },
  },
  submittedBy: {
    select: {
      name: true,
    },
  },
  finalReviewer: {
    select: {
      name: true,
    },
  },
} as const;

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const { submissionId } = await context.params;
  const body = (await request.json().catch(() => null)) as { reason?: string } | null;
  const reason = body?.reason?.trim() ?? "";
  if (reason.length < 2) {
    return NextResponse.json({ message: "请填写驳回原因" }, { status: 400 });
  }
  if (reason.length > 500) {
    return NextResponse.json({ message: "驳回原因不能超过 500 字" }, { status: 400 });
  }

  const submission = await prisma.teacherTrainingSubmission.findFirst({
    where: {
      id: submissionId,
      task: {
        deletedAt: null,
        cohort: {
          deletedAt: null,
        },
      },
    },
    select: {
      id: true,
      status: true,
      submittedById: true,
      task: {
        select: {
          id: true,
          title: true,
          taskType: true,
          cohortId: true,
        },
      },
      participant: {
        select: {
          accountUserId: true,
          groupName: true,
        },
      },
    },
  });

  if (!submission) {
    return NextResponse.json({ message: "任务汇报不存在" }, { status: 404 });
  }

  // 权限：仅系统管理员 / 当前班次省培负责人 / 当前班次省培班主任，且提交必须属于当前班次（不跨班次）。
  if (!(await hasTeacherTrainingCohortManageAccess(user, submission.task.cohortId))) {
    return NextResponse.json({ message: "无权限驳回该任务汇报" }, { status: 403 });
  }

  // 不允许重复驳回已处于 rejected 状态的记录。
  if (submission.status === "rejected") {
    return NextResponse.json({ message: "该汇报已被驳回，无需重复驳回" }, { status: 409 });
  }

  const rejectedAt = new Date();
  const updatedSubmission = await prisma.$transaction(async (tx) => {
    const updated = await tx.teacherTrainingSubmission.update({
      where: { id: submission.id },
      // 复用现有字段保存驳回轨迹：finalComment=原因、finalReviewedById=驳回人、finalReviewedAt=时间。
      // 不删除任务、提交记录或附件；被驳回记录不再计入“已提交”，原分数也不再作为有效终评分。
      data: {
        status: "rejected",
        finalComment: reason,
        finalReviewedById: user.id,
        finalReviewedAt: rejectedAt,
      },
      include: submissionInclude,
    });

    await createAuditLogEntry({
      tx,
      operator: { id: user.id, role: user.role },
      action: "teacher_training_submission.rejected",
      objectType: "teacher_training_submission",
      objectId: submission.id,
      reason,
      metadata: {
        taskId: submission.task.id,
        taskTitle: submission.task.title,
        taskType: submission.task.taskType,
        cohortId: submission.task.cohortId,
      },
    });

    return updated;
  });

  // 通知对象：原提交人；小组任务再加当前组长（去重后只发一次）；普通任务加汇报对应教师。
  const recipientUserIds = new Set<string>();
  if (submission.submittedById) recipientUserIds.add(submission.submittedById);
  if (submission.task.taskType === "group") {
    const groupName = submission.participant?.groupName?.trim() || "";
    if (groupName) {
      const members = await prisma.teacherTrainingParticipant.findMany({
        where: { cohortId: submission.task.cohortId, groupName },
        select: { accountUserId: true, extraInfo: true },
      });
      const leader = members.find(
        (member) => parseTeacherTrainingParticipantExtraInfo(member.extraInfo).isGroupLeader,
      );
      if (leader?.accountUserId) recipientUserIds.add(leader.accountUserId);
    }
  } else if (submission.participant?.accountUserId) {
    recipientUserIds.add(submission.participant.accountUserId);
  }

  // 站内通知必须成功保存；邮件失败只记录日志、不影响驳回结果。
  try {
    await createNotifications({
      userIds: [...recipientUserIds],
      title: "任务汇报被驳回",
      detail: `您提交的《${submission.task.title}》未通过审核。驳回原因：${reason}。请进入省培任务汇报重新提交。`,
      type: "teacher_training_submission_rejected",
      targetTab: "teacherTraining",
      relatedId: submission.task.id,
      senderId: user.id,
      email: { noticeType: "省培任务", actionLabel: "重新提交汇报", includeAdmins: true },
    });
  } catch (error) {
    console.error("[teacher-training] rejection notification failed", error);
  }

  return NextResponse.json({ submission: serializeTeacherTrainingSubmission(updatedSubmission) });
}
