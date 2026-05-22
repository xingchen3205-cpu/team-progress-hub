import { prisma } from "@/lib/prisma";

export type TrainingQuestionRevisionMeta = {
  lastEditedAt: Date;
  lastEditedById: string;
  lastEditedByName: string;
};

export const trainingQuestionRevisionAction = "training_question.revision";
export const trainingQuestionObjectType = "training_question";

export const getTrainingQuestionRevisionMeta = async (questionIds: string[]) => {
  const uniqueQuestionIds = [...new Set(questionIds.filter(Boolean))];

  if (uniqueQuestionIds.length === 0) {
    return new Map<string, TrainingQuestionRevisionMeta>();
  }

  const revisionLogs = await prisma.auditLog.findMany({
    where: {
      action: trainingQuestionRevisionAction,
      objectId: {
        in: uniqueQuestionIds,
      },
      objectType: trainingQuestionObjectType,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  const latestLogByQuestionId = new Map<string, (typeof revisionLogs)[number]>();
  for (const log of revisionLogs) {
    if (!latestLogByQuestionId.has(log.objectId)) {
      latestLogByQuestionId.set(log.objectId, log);
    }
  }

  const operatorIds = [...new Set([...latestLogByQuestionId.values()].map((log) => log.operatorId))];
  const operators = await prisma.user.findMany({
    where: {
      id: {
        in: operatorIds,
      },
    },
    select: {
      id: true,
      name: true,
    },
  });
  const operatorNameById = new Map(operators.map((operator) => [operator.id, operator.name]));

  return new Map(
    [...latestLogByQuestionId.entries()].map(([questionId, log]) => [
      questionId,
      {
        lastEditedAt: log.createdAt,
        lastEditedById: log.operatorId,
        lastEditedByName: operatorNameById.get(log.operatorId) ?? "未知用户",
      },
    ]),
  );
};
