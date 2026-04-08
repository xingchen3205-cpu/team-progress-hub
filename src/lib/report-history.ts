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

type ReportMemberLike = {
  id: string;
  systemRole: string;
  teamGroupId?: string | null;
};

const reportRequiredRoles = new Set(["项目负责人", "团队成员"]);

export const getVisibleReportMembers = <Member extends ReportMemberLike>({
  members,
  currentMemberId,
  canViewAllReports,
}: {
  members: Member[];
  currentMemberId: string;
  canViewAllReports: boolean;
}) => {
  if (!canViewAllReports) {
    return members.filter((member) => member.id === currentMemberId && reportRequiredRoles.has(member.systemRole));
  }

  return members.filter((member) => reportRequiredRoles.has(member.systemRole) && Boolean(member.teamGroupId));
};
