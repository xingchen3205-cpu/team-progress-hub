import path from "node:path";

import type { ProjectMaterialStatus, Role } from "@prisma/client";

import { hasGlobalAdminPrivileges } from "@/lib/permissions";

export const projectMaterialAllowedExtensions = [
  ".pdf",
  ".ppt",
  ".pptx",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".png",
  ".jpg",
  ".jpeg",
  ".mp4",
  ".mov",
] as const;

export const PROJECT_MATERIAL_MAX_SIZE = 100 * 1024 * 1024;
export const PROJECT_MATERIAL_VIDEO_MAX_SIZE = 20 * 1024 * 1024;

export const projectMaterialRequirementOptions = [
  {
    key: "plan_pdf",
    label: "计划书 PDF",
    description: "计划书导出的 PDF 版本。",
    accept: ".pdf",
  },
  {
    key: "ppt_pdf",
    label: "PPT PDF",
    description: "PPT 导出的 PDF 版本。",
    accept: ".pdf",
  },
  {
    key: "video_20mb",
    label: "视频",
    description: "不超过 20MB 的项目展示视频。",
    accept: ".mp4,.mov,.avi",
  },
] as const;

export type ProjectMaterialRequirementKey = (typeof projectMaterialRequirementOptions)[number]["key"];

export const defaultProjectMaterialRequirementsByStageType: Record<
  "online_review" | "roadshow",
  ProjectMaterialRequirementKey[]
> = {
  online_review: ["ppt_pdf", "plan_pdf", "video_20mb"],
  roadshow: [],
};

const projectMaterialRequirementSet = new Set<ProjectMaterialRequirementKey>(
  projectMaterialRequirementOptions.map((option) => option.key),
);

const PROJECT_STAGE_DESCRIPTION_META_PREFIX = "__PROJECT_STAGE_META__:";

export const getProjectMaterialRequirementOption = (key: ProjectMaterialRequirementKey) =>
  projectMaterialRequirementOptions.find((option) => option.key === key) ?? projectMaterialRequirementOptions[0];

export const getProjectMaterialRequirementLabel = (key: ProjectMaterialRequirementKey) =>
  getProjectMaterialRequirementOption(key).label;

const normalizeProjectMaterialRequirements = (
  value: unknown,
  stageType: keyof typeof defaultProjectMaterialRequirementsByStageType = "online_review",
) => {
  if (stageType === "roadshow") {
    return [];
  }

  if (!Array.isArray(value)) {
    return defaultProjectMaterialRequirementsByStageType[stageType];
  }

  const normalized = value.filter((item): item is ProjectMaterialRequirementKey =>
    typeof item === "string" && projectMaterialRequirementSet.has(item as ProjectMaterialRequirementKey),
  );

  return normalized.length > 0
    ? [...new Set(normalized)]
    : defaultProjectMaterialRequirementsByStageType[stageType];
};

const normalizeProjectStageTeamGroupIds = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return [
    ...new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
};

export const encodeProjectStageDescription = ({
  description,
  requiredMaterials,
  allowedTeamGroupIds,
  stageType = "online_review",
}: {
  description?: string | null;
  requiredMaterials?: ProjectMaterialRequirementKey[];
  allowedTeamGroupIds?: string[];
  stageType?: keyof typeof defaultProjectMaterialRequirementsByStageType;
}) =>
  `${PROJECT_STAGE_DESCRIPTION_META_PREFIX}${JSON.stringify({
    description: description?.trim() || "",
    requiredMaterials: normalizeProjectMaterialRequirements(requiredMaterials, stageType),
    allowedTeamGroupIds: normalizeProjectStageTeamGroupIds(allowedTeamGroupIds),
  })}`;

export const parseProjectStageDescription = (
  value?: string | null,
  stageType: keyof typeof defaultProjectMaterialRequirementsByStageType = "online_review",
) => {
  const fallback = {
    description: value ?? "",
    requiredMaterials: defaultProjectMaterialRequirementsByStageType[stageType],
    allowedTeamGroupIds: [] as string[],
  };

  if (!value?.startsWith(PROJECT_STAGE_DESCRIPTION_META_PREFIX)) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(value.slice(PROJECT_STAGE_DESCRIPTION_META_PREFIX.length)) as Record<string, unknown>;
    return {
      description: typeof parsed.description === "string" ? parsed.description : "",
      requiredMaterials: normalizeProjectMaterialRequirements(parsed.requiredMaterials, stageType),
      allowedTeamGroupIds: normalizeProjectStageTeamGroupIds(parsed.allowedTeamGroupIds),
    };
  } catch {
    return fallback;
  }
};

export const canTeamGroupAccessProjectStage = ({
  allowedTeamGroupIds,
  legacyTeamGroupId,
  actorTeamGroupId,
}: {
  allowedTeamGroupIds?: string[];
  legacyTeamGroupId?: string | null;
  actorTeamGroupId: string | null;
}) => {
  if (!actorTeamGroupId) {
    return false;
  }

  const normalizedAllowedIds = normalizeProjectStageTeamGroupIds(allowedTeamGroupIds);
  if (normalizedAllowedIds.length > 0) {
    return normalizedAllowedIds.includes(actorTeamGroupId);
  }

  return !legacyTeamGroupId || legacyTeamGroupId === actorTeamGroupId;
};

export const canManageProjectReviewStage = (role: Role) => hasGlobalAdminPrivileges(role);

export const canUploadProjectMaterial = ({
  role,
  teamGroupId,
}: {
  role: Role;
  teamGroupId: string | null;
}) => role === "leader" && Boolean(teamGroupId);

export const canReviewProjectMaterial = ({
  role,
  actorTeamGroupId,
  materialTeamGroupId,
}: {
  role: Role;
  actorTeamGroupId: string | null;
  materialTeamGroupId: string;
}) => hasGlobalAdminPrivileges(role) || (role === "teacher" && actorTeamGroupId === materialTeamGroupId);

export const buildProjectMaterialVisibilityWhere = (actor: {
  id: string;
  role: Role;
  teamGroupId: string | null;
}) => {
  if (hasGlobalAdminPrivileges(actor.role)) {
    return {};
  }

  if (actor.teamGroupId) {
    return { teamGroupId: actor.teamGroupId };
  }

  return { submittedById: actor.id };
};

export const validateProjectMaterialUploadMeta = ({
  fileName,
  fileSize,
  materialKind,
}: {
  fileName: string;
  fileSize: number;
  materialKind?: ProjectMaterialRequirementKey;
}) => {
  const extension = path.extname(fileName).toLowerCase();
  if (!projectMaterialAllowedExtensions.includes(extension as ProjectMaterialAllowedExtension)) {
    return "项目材料不支持该文件格式";
  }

  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    return "项目材料文件大小无效";
  }

  if (materialKind === "plan_pdf" && extension !== ".pdf") {
    return "计划书 PDF 仅支持 PDF 文件";
  }

  if (materialKind === "ppt_pdf" && extension !== ".pdf") {
    return "PPT PDF 仅支持 PDF 文件";
  }

  if (materialKind === "video_20mb") {
    if (![".mp4", ".mov", ".avi"].includes(extension)) {
      return "视频文件不支持该文件格式";
    }

    if (fileSize > PROJECT_MATERIAL_VIDEO_MAX_SIZE) {
      return "视频文件大小不能超过 20MB";
    }
  }

  if (fileSize > PROJECT_MATERIAL_MAX_SIZE) {
    return "项目材料文件大小不能超过 100MB";
  }

  return null;
};

export const inferExpertReviewMaterialKindFromRequirement = (
  materialKind?: ProjectMaterialRequirementKey | null,
) => {
  if (materialKind === "ppt_pdf") {
    return "ppt" as const;
  }

  if (materialKind === "video_20mb") {
    return "video" as const;
  }

  return "plan" as const;
};

export const projectMaterialStatusLabels: Record<ProjectMaterialStatus, string> = {
  pending: "待指导教师审批",
  approved: "已生效",
  rejected: "已驳回",
};

export const getProjectMaterialStatusLabel = (status: ProjectMaterialStatus) =>
  projectMaterialStatusLabels[status];

type ProjectMaterialAllowedExtension = (typeof projectMaterialAllowedExtensions)[number];

type CurrentApprovedCandidate = {
  id: string;
  stageId: string;
  teamGroupId: string;
  status: ProjectMaterialStatus;
  approvedAt: Date | string | null;
  createdAt: Date | string;
};

const toTime = (value: Date | string | null) => {
  if (!value) {
    return null;
  }

  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
};

const getFreshnessTime = (material: CurrentApprovedCandidate) =>
  toTime(material.approvedAt) ?? toTime(material.createdAt) ?? 0;

const compareCurrentApprovedCandidate = (
  left: CurrentApprovedCandidate,
  right: CurrentApprovedCandidate,
) => {
  const approvalDelta = getFreshnessTime(left) - getFreshnessTime(right);
  if (approvalDelta !== 0) {
    return approvalDelta;
  }

  return (toTime(left.createdAt) ?? 0) - (toTime(right.createdAt) ?? 0);
};

export const selectCurrentApprovedProjectMaterials = <T extends CurrentApprovedCandidate>(
  materials: T[],
) => {
  const latestByStageAndTeam = new Map<string, T>();

  for (const material of materials) {
    if (material.status !== "approved") {
      continue;
    }

    const key = `${material.stageId}:${material.teamGroupId}`;
    const selected = latestByStageAndTeam.get(key);

    if (!selected || compareCurrentApprovedCandidate(material, selected) > 0) {
      latestByStageAndTeam.set(key, material);
    }
  }

  return [...latestByStageAndTeam.values()];
};
