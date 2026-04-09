import type { Role, UserApprovalStatus } from "@prisma/client";

type NotificationEmailCandidate = {
  email?: string | null;
  name: string;
  role: Role;
  approvalStatus: UserApprovalStatus;
  teamGroupId?: string | null;
};

export const filterNotificationEmailRecipients = (
  recipients: NotificationEmailCandidate[],
  { emailTeamGroupId }: { emailTeamGroupId?: string | null },
) => {
  return recipients
    .filter((recipient) => recipient.role !== "admin")
    .filter((recipient) => recipient.approvalStatus === "approved")
    .filter((recipient) => Boolean(recipient.email?.trim()))
    .filter((recipient) => {
      if (emailTeamGroupId === undefined) {
        return true;
      }

      if (emailTeamGroupId === null) {
        return false;
      }

      return recipient.teamGroupId === emailTeamGroupId;
    })
    .map((recipient) => ({
      email: recipient.email!.trim(),
      name: recipient.name,
    }));
};
