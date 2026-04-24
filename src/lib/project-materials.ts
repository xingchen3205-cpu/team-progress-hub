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

export const canManageProjectReviewStage = (role: Role) => hasGlobalAdminPrivileges(role);

export const canUploadProjectMaterial = ({
  role,
  teamGroupId,
}: {
  role: Role;
  teamGroupId: string | null;
}) => (role === "leader" || role === "member") && Boolean(teamGroupId);

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
}: {
  fileName: string;
  fileSize: number;
}) => {
  const extension = path.extname(fileName).toLowerCase();
  if (!projectMaterialAllowedExtensions.includes(extension as ProjectMaterialAllowedExtension)) {
    return "项目材料不支持该文件格式";
  }

  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    return "项目材料文件大小无效";
  }

  if (fileSize > PROJECT_MATERIAL_MAX_SIZE) {
    return "项目材料文件大小不能超过 100MB";
  }

  return null;
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
