import type { Role } from "@prisma/client";

import { toIsoDateKey } from "@/lib/date";

type BuildReportDateOptionsInput = {
  reportDates: string[];
  selectedDate: string;
  todayDateKey: string;
  daysBack?: number;
};

const dateKeyPattern = /^\d{4}-\d{2}-\d{2}$/;

export const isReportDateKey = (value: string) => dateKeyPattern.test(value);

const shiftDateKey = (dateKey: string, offsetDays: number) => {
  const date = new Date(`${dateKey}T00:00:00+08:00`);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return toIsoDateKey(date);
};

export const buildReportDateOptions = ({
  reportDates,
  selectedDate,
  todayDateKey,
  daysBack = 7,
}: BuildReportDateOptionsInput) => {
  const dateSet = new Set<string>();

  for (let index = 0; index <= daysBack; index += 1) {
    dateSet.add(shiftDateKey(todayDateKey, -index));
  }

  for (const date of reportDates) {
    if (isReportDateKey(date)) {
      dateSet.add(date);
    }
  }

  if (isReportDateKey(selectedDate)) {
    dateSet.add(selectedDate);
  }

  return Array.from(dateSet).sort((left, right) => (left < right ? 1 : -1));
};

export const getReportAttachmentNote = (attachment?: string | null) => {
  const trimmed = attachment?.trim() ?? "";
  return trimmed && trimmed !== "未上传附件" ? trimmed : null;
};

export const getAdminReportDeleteFilter = ({
  date,
  teamGroupId,
}: {
  date?: string | null;
  teamGroupId?: string | null;
}) => {
  const nextDate = date?.trim() ?? "";
  const nextTeamGroupId = teamGroupId?.trim() ?? "";

  if (!isReportDateKey(nextDate) || !nextTeamGroupId) {
    return null;
  }

  return {
    date: nextDate,
    user: {
      teamGroupId: nextTeamGroupId,
    },
  };
};

export const getAdminReportViewFilter = (teamGroupId?: string | null) => {
  const nextTeamGroupId = teamGroupId?.trim() ?? "";
  const allowedRoles: Role[] = ["leader", "member"];

  if (!nextTeamGroupId) {
    return undefined;
  }

  return {
    user: {
      teamGroupId: nextTeamGroupId,
      role: {
        in: allowedRoles,
      },
    },
  };
};

type ReportMemberLike = {
  id: string;
  systemRole: string;
  teamGroupId?: string | null;
};

const reportRequiredRoles = new Set(["项目负责人", "团队成员"]);

export type ReportsViewRole = "student" | "teacher" | "admin";

export const getReportsViewRole = (role: Role): ReportsViewRole => {
  if (role === "admin" || role === "school_admin") {
    return "admin";
  }

  if (role === "teacher") {
    return "teacher";
  }

  return "student";
};

export const getScopedReportViewFilter = ({
  role,
  userId,
  viewerTeamGroupId,
  selectedTeamGroupId,
}: {
  role: Role;
  userId: string;
  viewerTeamGroupId?: string | null;
  selectedTeamGroupId?: string | null;
}) => {
  const reportsViewRole = getReportsViewRole(role);

  if (reportsViewRole === "admin") {
    return getAdminReportViewFilter(selectedTeamGroupId);
  }

  if (viewerTeamGroupId) {
    return {
      user: {
        teamGroupId: viewerTeamGroupId,
        role: {
          in: ["leader", "member"] satisfies Role[],
        },
      },
    };
  }

  return { userId };
};

export const getVisibleReportMembers = <Member extends ReportMemberLike>({
  members,
  currentMemberId,
  viewerRole,
  viewerTeamGroupId,
  selectedTeamGroupId,
}: {
  members: Member[];
  currentMemberId: string;
  viewerRole: Role;
  viewerTeamGroupId?: string | null;
  selectedTeamGroupId?: string | null;
}) => {
  const reportsViewRole = getReportsViewRole(viewerRole);

  return members.filter((member) => {
    if (!reportRequiredRoles.has(member.systemRole) || !member.teamGroupId) {
      return false;
    }

    if (reportsViewRole === "admin") {
      if (!selectedTeamGroupId) {
        return true;
      }

      return member.teamGroupId === selectedTeamGroupId;
    }

    if (viewerTeamGroupId) {
      return member.teamGroupId === viewerTeamGroupId;
    }

    return member.id === currentMemberId;
  });
};
