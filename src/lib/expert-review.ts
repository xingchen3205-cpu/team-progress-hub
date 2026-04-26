import type {
  ExpertReviewAssignment,
  ExpertReviewMaterial,
  ExpertReviewMaterialKind,
  ExpertReviewPackage,
  ProjectReviewStage,
  ExpertReviewAssignmentStatus,
  ExpertReviewScore,
  User,
  Role,
} from "@prisma/client";
import path from "node:path";

import { roleLabels } from "@/lib/permissions";

export const expertReviewCategoryCaps = {
  scorePersonalGrowth: 25,
  scoreInnovation: 30,
  scoreIndustry: 30,
  scoreTeamwork: 15,
} as const;

export type ExpertReviewScoreField = keyof typeof expertReviewCategoryCaps;
export type ExpertReviewGrade = "A" | "B" | "C" | "D" | "E";

export const expertReviewGradeOrder: ExpertReviewGrade[] = ["A", "B", "C", "D", "E"];
const expertReviewGradeRatios: Record<ExpertReviewGrade, number> = {
  A: 1,
  B: 0.9,
  C: 0.8,
  D: 0.7,
  E: 0.6,
};

export const expertReviewFieldLabels: Record<ExpertReviewScoreField, string> = {
  scorePersonalGrowth: "个人成长",
  scoreInnovation: "项目创新",
  scoreIndustry: "产业价值",
  scoreTeamwork: "团队协作",
};

export const expertReviewFieldHints: Record<ExpertReviewScoreField, string[]> = {
  scorePersonalGrowth: [
    "立德树人",
    "调研深入",
    "逻辑正确",
    "知识掌握与应用能力",
    "人才培养成效",
  ],
  scoreInnovation: [
    "原始创新",
    "培养成效",
    "模式创新",
    "创新成效",
  ],
  scoreIndustry: [
    "产业发展与市场",
    "商业模式",
    "经营绩效与管理",
    "成长前景",
    "财务与社会价值",
  ],
  scoreTeamwork: [
    "团队精神",
    "团队结构",
    "团队效能",
    "团队资源",
  ],
};

export const getExpertReviewGradeChoices = (field: ExpertReviewScoreField) =>
  expertReviewGradeOrder.map((grade) => ({
    grade,
    score: Math.round(expertReviewCategoryCaps[field] * expertReviewGradeRatios[grade]),
  }));

export const mapExpertReviewGradeToScore = (
  field: ExpertReviewScoreField,
  grade: ExpertReviewGrade,
) => Math.round(expertReviewCategoryCaps[field] * expertReviewGradeRatios[grade]);

export const getExpertReviewGradeFromScore = (
  field: ExpertReviewScoreField,
  score?: number | null,
): ExpertReviewGrade | "" => {
  if (typeof score !== "number" || Number.isNaN(score)) {
    return "";
  }

  return getExpertReviewGradeChoices(field).reduce<ExpertReviewGrade>((closest, option) => {
    const closestDistance = Math.abs(mapExpertReviewGradeToScore(field, closest) - score);
    const optionDistance = Math.abs(option.score - score);
    return optionDistance < closestDistance ? option.grade : closest;
  }, "A");
};

export const expertReviewMaterialLabels: Record<ExpertReviewMaterialKind, string> = {
  plan: "计划书",
  ppt: "路演材料",
  video: "视频",
};

const expertReviewMaterialAllowedExtensions: Record<ExpertReviewMaterialKind, string[]> = {
  // 评委端要求稳定在线预览，因此材料统一收敛到浏览器友好的导出版格式。
  plan: [".pdf"],
  ppt: [".pdf"],
  video: [".mp4", ".mov", ".avi"],
};

const expertReviewMaterialMaxSize = 30 * 1024 * 1024;

export const validateExpertReviewMaterial = ({
  kind,
  fileName,
  fileSize,
}: {
  kind: ExpertReviewMaterialKind;
  fileName: string;
  fileSize: number;
}) => {
  const extension = path.extname(fileName).toLowerCase();
  if (!expertReviewMaterialAllowedExtensions[kind].includes(extension)) {
    return `${expertReviewMaterialLabels[kind]}不支持该文件格式`;
  }

  if (fileSize > expertReviewMaterialMaxSize) {
    return `${expertReviewMaterialLabels[kind]}文件大小不能超过 30MB`;
  }

  return null;
};

export const expertReviewAcceptAttributes: Record<ExpertReviewMaterialKind, string> = {
  plan: ".pdf",
  ppt: ".pdf",
  video: ".mp4,.mov,.avi",
};

export type ExpertReviewMode = "network" | "roadshow";

export const getExpertReviewMode = (
  assignment: Pick<ExpertReviewPackage, "targetName" | "roundLabel" | "overview"> & {
    projectReviewStage?: Pick<ProjectReviewStage, "id" | "type"> | null;
  },
): ExpertReviewMode => {
  if (assignment.projectReviewStage?.type === "roadshow") {
    return "roadshow";
  }

  if (assignment.projectReviewStage?.type === "online_review") {
    return "network";
  }

  const text = `${assignment.roundLabel ?? ""} ${assignment.targetName ?? ""} ${assignment.overview ?? ""}`;
  return /路演|答辩|现场|视频/i.test(text) ? "roadshow" : "network";
};

export type ExpertReviewWindowKey = "not_started" | "open" | "ended";

export const getExpertReviewWindowState = ({
  startAt,
  deadline,
  lockedAt,
  now = new Date(),
}: {
  startAt?: Date | string | null;
  deadline?: Date | string | null;
  lockedAt?: Date | string | null;
  now?: Date;
}): {
  key: ExpertReviewWindowKey;
  label: "未开始" | "进行中" | "已结束";
} => {
  if (lockedAt) {
    return { key: "ended", label: "已结束" };
  }

  const nowTime = now.getTime();

  if (startAt && new Date(startAt).getTime() > nowTime) {
    return { key: "not_started", label: "未开始" };
  }

  if (deadline && new Date(deadline).getTime() <= nowTime) {
    return { key: "ended", label: "已结束" };
  }

  return { key: "open", label: "进行中" };
};

export const getExpertReviewLockState = ({
  deadline,
  lockedAt,
}: {
  deadline?: Date | string | null;
  lockedAt?: Date | string | null;
}) => {
  if (lockedAt) {
    return true;
  }

  if (!deadline) {
    return false;
  }

  return new Date(deadline).getTime() <= Date.now();
};

export const getExpertReviewStatus = ({
  status,
  startAt,
  deadline,
  score,
}: {
  status: ExpertReviewAssignmentStatus;
  startAt?: Date | string | null;
  deadline?: Date | string | null;
  score?: Pick<ExpertReviewScore, "lockedAt"> | null;
}) => {
  if (status === "completed" || score) {
    return {
      key: "completed" as const,
      label: "已提交" as const,
    };
  }

  if (
    status === "locked" ||
    getExpertReviewWindowState({ startAt, deadline, lockedAt: null }).key === "ended"
  ) {
    return {
      key: "locked" as const,
      label: "已锁定" as const,
    };
  }

  return {
    key: "pending" as const,
    label: "待评审" as const,
  };
};

export const validateExpertReviewScores = (payload: Record<ExpertReviewScoreField, number>) => {
  let total = 0;

  for (const [field, cap] of Object.entries(expertReviewCategoryCaps) as Array<
    [ExpertReviewScoreField, number]
  >) {
    const value = payload[field];

    if (!Number.isInteger(value) || value < 0 || value > cap) {
      return `${expertReviewFieldLabels[field]}分数需为 0-${cap} 分的整数`;
    }

    total += value;
  }

  if (total > 100) {
    return "四项总分不能超过 100 分";
  }

  return null;
};

export const serializeExpertReviewAssignment = (
  assignment: ExpertReviewAssignment & {
    expertUser: Pick<User, "id" | "name" | "avatar" | "role">;
    reviewPackage: Pick<ExpertReviewPackage, "id" | "targetName" | "roundLabel" | "overview" | "status" | "startAt" | "deadline"> & {
      projectReviewStage?: Pick<ProjectReviewStage, "id" | "type"> | null;
      materials: Array<
        Pick<
          ExpertReviewMaterial,
          "id" | "kind" | "name" | "fileName" | "fileSize" | "mimeType" | "uploadedAt"
        >
      >;
    };
    score: Pick<
      ExpertReviewScore,
      | "id"
      | "scorePersonalGrowth"
      | "scoreInnovation"
      | "scoreIndustry"
      | "scoreTeamwork"
      | "totalScore"
      | "commentTotal"
      | "submittedAt"
      | "updatedAt"
      | "lockedAt"
    > | null;
  },
) => {
  const derivedStatus = getExpertReviewStatus({
    status: assignment.status,
    startAt: assignment.reviewPackage.startAt,
    deadline: assignment.reviewPackage.deadline,
    score: assignment.score,
  });
  const reviewWindowState = getExpertReviewWindowState({
    startAt: assignment.reviewPackage.startAt,
    deadline: assignment.reviewPackage.deadline,
    lockedAt: assignment.score?.lockedAt ?? null,
  });
  const planMaterial = assignment.reviewPackage.materials.find((item) => item.kind === "plan") ?? null;
  const pptMaterial = assignment.reviewPackage.materials.find((item) => item.kind === "ppt") ?? null;
  const videoMaterial = assignment.reviewPackage.materials.find((item) => item.kind === "video") ?? null;

  return {
    id: assignment.id,
    packageId: assignment.reviewPackage.id,
    packageStatus: assignment.reviewPackage.status,
    projectReviewStageId: assignment.reviewPackage.projectReviewStage?.id ?? null,
    targetName: assignment.reviewPackage.targetName,
    roundLabel: assignment.reviewPackage.roundLabel ?? "当前轮次",
    overview: assignment.reviewPackage.overview ?? "",
    reviewMode: getExpertReviewMode(assignment.reviewPackage),
    startAt: assignment.reviewPackage.startAt?.toISOString() ?? null,
    deadline: assignment.reviewPackage.deadline?.toISOString() ?? null,
    reviewWindowState: reviewWindowState.key,
    reviewWindowLabel: reviewWindowState.label,
    status: derivedStatus.label,
    statusKey: derivedStatus.key,
    canEdit: derivedStatus.key === "pending" && reviewWindowState.key === "open" && !assignment.score,
    expert: {
      id: assignment.expertUser.id,
      name: assignment.expertUser.name,
      avatar: assignment.expertUser.avatar,
      roleLabel: roleLabels[assignment.expertUser.role],
    },
    materials: {
      plan: planMaterial
        ? {
            id: planMaterial.id,
            name: planMaterial.name,
            fileName: planMaterial.fileName,
            fileSize: planMaterial.fileSize,
            mimeType: planMaterial.mimeType,
            previewUrl: `/api/expert-reviews/assignments/${assignment.id}/materials/plan`,
          }
        : null,
      ppt: pptMaterial
        ? {
            id: pptMaterial.id,
            name: pptMaterial.name,
            fileName: pptMaterial.fileName,
            fileSize: pptMaterial.fileSize,
            mimeType: pptMaterial.mimeType,
            previewUrl: `/api/expert-reviews/assignments/${assignment.id}/materials/ppt`,
          }
        : null,
      video: videoMaterial
        ? {
            id: videoMaterial.id,
            name: videoMaterial.name,
            fileName: videoMaterial.fileName,
            fileSize: videoMaterial.fileSize,
            mimeType: videoMaterial.mimeType,
            previewUrl: `/api/expert-reviews/assignments/${assignment.id}/materials/video`,
          }
        : null,
    },
    score: assignment.score
      ? {
          id: assignment.score.id,
          scorePersonalGrowth: assignment.score.scorePersonalGrowth,
          scoreInnovation: assignment.score.scoreInnovation,
          scoreIndustry: assignment.score.scoreIndustry,
          scoreTeamwork: assignment.score.scoreTeamwork,
          totalScore: assignment.score.totalScore,
          commentTotal: assignment.score.commentTotal,
          submittedAt: assignment.score.submittedAt.toISOString(),
          updatedAt: assignment.score.updatedAt.toISOString(),
          lockedAt: assignment.score.lockedAt?.toISOString() ?? null,
        }
      : null,
  };
};

export type SerializedExpertReviewAssignment = ReturnType<typeof serializeExpertReviewAssignment>;

export const redactExpertReviewAssignmentForRole = (
  assignment: SerializedExpertReviewAssignment,
  role: Role,
) => {
  if (role !== "member") {
    return assignment;
  }

  return {
    ...assignment,
    materials: {
      plan: null,
      ppt: null,
      video: null,
    },
  };
};
