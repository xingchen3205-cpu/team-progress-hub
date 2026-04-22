import type { ReportEvaluationType, Role } from "@prisma/client";

import { toIsoDateKey } from "@/lib/date";
import { hasGlobalAdminPrivileges, roleLabels } from "@/lib/permissions";

export const REPORT_EVALUATION_REVOKE_WINDOW_MS = 10 * 60 * 1000;

export type StudentRankingInput = {
  userId: string;
  submittedDateKeys: string[];
  praiseCount: number;
  continuousSubmitDays: number;
  eligibleDaysInMonth: number;
  lastSubmittedAt?: string | null;
};

export type StudentRankingEntry = {
  userId: string;
  monthlySubmitRate: number;
  praiseCount: number;
  continuousSubmitDays: number;
  score: number;
  rank: number;
  lastSubmittedAt?: string | null;
};

const normalizeDateKeys = (dateKeys: string[]) =>
  [...new Set(dateKeys)].sort((left, right) => (left < right ? 1 : -1));

const shiftDateKey = (dateKey: string, offsetDays: number) => {
  const date = new Date(`${dateKey}T00:00:00+08:00`);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return toIsoDateKey(date);
};

export const isStudentReportRole = (role: Role) => role === "leader" || role === "member";

export const getEvaluationTypeCountField = (type: ReportEvaluationType) => {
  switch (type) {
    case "praise":
      return "praiseCount";
    case "improve":
      return "improveCount";
    case "comment":
      return "commentCount";
    default:
      return "commentCount";
  }
};

export const buildReportEvaluationCountUpdate = (
  type: ReportEvaluationType,
  mode: "increment" | "decrement",
) => {
  const field = getEvaluationTypeCountField(type);
  return {
    [field]: {
      [mode]: 1,
    },
  } as Record<string, { increment?: number; decrement?: number }>;
};

export const validateEvaluationContent = ({
  type,
  content,
}: {
  type: ReportEvaluationType;
  content?: string | null;
}) => {
  const trimmed = content?.trim() ?? "";

  if (type === "praise") {
    return {
      valid: true,
      normalizedContent: trimmed || null,
    } as const;
  }

  if (!trimmed) {
    return {
      valid: false,
      message: type === "improve" ? "待改进评价必须填写内容" : "普通批注必须填写内容",
    } as const;
  }

  return {
    valid: true,
    normalizedContent: trimmed,
  } as const;
};

export const canCreateReportEvaluation = ({
  actorRole,
  actorTeamGroupId,
  reportOwnerTeamGroupId,
}: {
  actorRole: Role;
  actorTeamGroupId?: string | null;
  reportOwnerTeamGroupId?: string | null;
}) => actorRole === "teacher" && Boolean(actorTeamGroupId && reportOwnerTeamGroupId && actorTeamGroupId === reportOwnerTeamGroupId);

export const canViewStudentEvaluationResource = ({
  actorId,
  actorRole,
  targetUserId,
}: {
  actorId: string;
  actorRole: Role;
  targetUserId: string;
}) => actorId === targetUserId || hasGlobalAdminPrivileges(actorRole);

export const canViewReportEvaluationThread = ({
  actorId,
  actorRole,
  actorTeamGroupId,
  reportOwnerId,
  reportOwnerTeamGroupId,
}: {
  actorId: string;
  actorRole: Role;
  actorTeamGroupId?: string | null;
  reportOwnerId: string;
  reportOwnerTeamGroupId?: string | null;
}) => {
  if (hasGlobalAdminPrivileges(actorRole)) {
    return true;
  }

  if (actorId === reportOwnerId) {
    return true;
  }

  return actorRole === "teacher" && Boolean(actorTeamGroupId && reportOwnerTeamGroupId && actorTeamGroupId === reportOwnerTeamGroupId);
};

export const canRevokeReportEvaluation = ({
  actorId,
  evaluatorId,
  createdAt,
  revokedAt,
  now = new Date(),
}: {
  actorId: string;
  evaluatorId: string;
  createdAt: Date;
  revokedAt?: Date | null;
  now?: Date;
}) => {
  if (revokedAt) {
    return false;
  }

  if (actorId !== evaluatorId) {
    return false;
  }

  return now.getTime() - createdAt.getTime() <= REPORT_EVALUATION_REVOKE_WINDOW_MS;
};

export const calculateContinuousSubmitDays = (submittedDateKeys: string[]) => {
  const normalizedDateKeys = normalizeDateKeys(submittedDateKeys);
  if (normalizedDateKeys.length === 0) {
    return 0;
  }

  let streak = 1;
  for (let index = 1; index < normalizedDateKeys.length; index += 1) {
    const previousDateKey = normalizedDateKeys[index - 1];
    const currentDateKey = normalizedDateKeys[index];
    if (currentDateKey === shiftDateKey(previousDateKey, -1)) {
      streak += 1;
      continue;
    }

    break;
  }

  return streak;
};

export const calculateMonthlySubmitRate = ({
  submittedDateKeys,
  month,
  eligibleDaysInMonth,
}: {
  submittedDateKeys: string[];
  month: string;
  eligibleDaysInMonth: number;
}) => {
  if (eligibleDaysInMonth <= 0) {
    return 0;
  }

  const submittedCount = normalizeDateKeys(submittedDateKeys).filter((dateKey) => dateKey.startsWith(`${month}-`)).length;
  return Math.round((submittedCount / eligibleDaysInMonth) * 100);
};

const compareLastSubmittedAt = (left?: string | null, right?: string | null) => {
  if (left && right) {
    if (left < right) {
      return -1;
    }

    if (left > right) {
      return 1;
    }
  }

  if (left) {
    return -1;
  }

  if (right) {
    return 1;
  }

  return 0;
};

export const buildStudentRanking = (items: StudentRankingInput[], month = toIsoDateKey(new Date()).slice(0, 7)): StudentRankingEntry[] => {
  const ranked = items
    .map((item) => {
      const monthlySubmitRate = calculateMonthlySubmitRate({
        submittedDateKeys: item.submittedDateKeys,
        month,
        eligibleDaysInMonth: item.eligibleDaysInMonth,
      });

      /**
       * 排名规则说明：
       * - 本月提交率 × 40%
       * - 本月累计红花数 × 40%
       * - 当前连续提交天数 × 20%
       * - 同分时按最后提交时间更早者优先
       */
      const score = Number((monthlySubmitRate * 0.4 + item.praiseCount * 0.4 + item.continuousSubmitDays * 0.2).toFixed(2));

      return {
        userId: item.userId,
        monthlySubmitRate,
        praiseCount: item.praiseCount,
        continuousSubmitDays: item.continuousSubmitDays,
        score,
        lastSubmittedAt: item.lastSubmittedAt ?? null,
      };
    })
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return compareLastSubmittedAt(left.lastSubmittedAt, right.lastSubmittedAt);
    });

  return ranked.map((item, index) => ({
    ...item,
    rank: index + 1,
  }));
};

export const getMonthReference = (referenceDate = new Date()) => ({
  monthKey: toIsoDateKey(referenceDate).slice(0, 7),
  dateKey: toIsoDateKey(referenceDate),
  eligibleDaysInMonth: referenceDate.getDate(),
});

export const buildReportEvaluationNotification = ({
  evaluatorName,
  type,
  content,
}: {
  evaluatorName: string;
  type: ReportEvaluationType;
  content?: string | null;
}) => {
  const trimmed = content?.trim() ?? "";

  switch (type) {
    case "praise":
      return {
        title: "汇报收到点赞",
        detail: trimmed ? `${evaluatorName} 给你的汇报点了赞：${trimmed}` : `${evaluatorName} 给你的汇报点了赞。`,
      };
    case "improve":
      return {
        title: "汇报收到待改进反馈",
        detail: `${evaluatorName} 标记了需要改进的地方：${trimmed}`,
      };
    case "comment":
    default:
      return {
        title: "汇报收到新批注",
        detail: `${evaluatorName} 留下了新批注：${trimmed}`,
      };
  }
};

export const reportEvaluationTypeLabels: Record<ReportEvaluationType, string> = {
  praise: "点赞",
  improve: "待改进",
  comment: "批注",
};

export const getReportEvaluationRoleLabel = (role: Role) => roleLabels[role] ?? role;
