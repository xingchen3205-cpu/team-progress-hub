import type { RoleKey, TeamMember } from "@/data/demo-data";

type DocumentReminderStatusKey = "pending" | "leader_approved" | "approved" | "leader_revision" | "revision";
const roleKeys: RoleKey[] = ["admin", "school_admin", "teacher", "leader", "member", "expert"];

const documentReminderTargetRoles: Record<DocumentReminderStatusKey, RoleKey[]> = {
  pending: ["leader"],
  leader_approved: ["teacher"],
  approved: [],
  leader_revision: [],
  revision: [],
};

export const canTriggerDocumentReminder = ({
  actorRole,
  statusKey,
}: {
  actorRole: RoleKey;
  statusKey: DocumentReminderStatusKey;
}) => ["admin", "school_admin", "teacher"].includes(actorRole) && documentReminderTargetRoles[statusKey].length > 0;

export const getDocumentReminderLabel = (statusKey: DocumentReminderStatusKey) => {
  switch (statusKey) {
    case "pending":
      return "提醒负责人";
    case "leader_approved":
      return "提醒教师终审";
    default:
      return "提醒";
  }
};

export const getDocumentReminderTargetRoles = (statusKey: DocumentReminderStatusKey) =>
  documentReminderTargetRoles[statusKey];

export const getDocumentReminderRecipientIds = ({
  statusKey,
  currentUserId,
  currentTeamGroupId,
  teamMembers,
}: {
  statusKey: DocumentReminderStatusKey;
  currentUserId: string | null;
  currentTeamGroupId: string | null | undefined;
  teamMembers: TeamMember[];
}) =>
  teamMembers
    .filter(
      (member) =>
        roleKeys.includes(member.role as RoleKey) &&
        documentReminderTargetRoles[statusKey].includes(member.role as RoleKey) &&
        member.id !== currentUserId &&
        member.approvalStatus === "approved" &&
        member.teamGroupId === currentTeamGroupId,
    )
    .map((member) => member.id);
