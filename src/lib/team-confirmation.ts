export type TeamManagementConfirmation = {
  title: string;
  message: string;
  confirmLabel: string;
  confirmVariant: "primary" | "danger";
  successTitle: string;
  successDetail: string;
};

export type TeamManagementConfirmationIntent =
  | {
      type: "roleChange";
      memberName: string;
      fromRole: string;
      toRole: string;
    }
  | {
      type: "groupChange";
      memberName: string;
      fromGroupName?: string | null;
      toGroupName?: string | null;
    }
  | {
      type: "approveRegistration";
      memberName: string;
      roleLabel: string;
    }
  | {
      type: "rejectRegistration";
      memberName: string;
    }
  | {
      type: "deleteAccount";
      memberName: string;
    }
  | {
      type: "deleteGroup";
      groupName: string;
    };

const normalizeGroupName = (name?: string | null) => name?.trim() || "未分组";

export const buildTeamManagementConfirmation = (
  intent: TeamManagementConfirmationIntent,
): TeamManagementConfirmation => {
  switch (intent.type) {
    case "roleChange":
      return {
        title: "确认调整角色",
        message: `确认将「${intent.memberName}」的角色从「${intent.fromRole}」调整为「${intent.toRole}」？角色变更后权限会立即变化。`,
        confirmLabel: "确认调整",
        confirmVariant: "primary",
        successTitle: "角色已更新",
        successDetail: "账号权限已经按新角色生效。",
      };
    case "groupChange":
      return {
        title: "确认调整分组",
        message: `确认将「${intent.memberName}」从「${normalizeGroupName(intent.fromGroupName)}」调整到「${normalizeGroupName(intent.toGroupName)}」？调整后该账号可见范围会立即变化。`,
        confirmLabel: "确认调整",
        confirmVariant: "primary",
        successTitle: "分组已更新",
        successDetail: "账号所属分组已经同步。",
      };
    case "approveRegistration":
      return {
        title: "确认审核通过",
        message: `确认通过「${intent.memberName}」的「${intent.roleLabel}」账号申请？通过后该账号可以登录系统。`,
        confirmLabel: "确认通过",
        confirmVariant: "primary",
        successTitle: "审核已通过",
        successDetail: "该账号现在可以正常登录系统。",
      };
    case "rejectRegistration":
      return {
        title: "确认驳回注册",
        message: `确认驳回并删除「${intent.memberName}」的注册申请？该操作不可恢复。`,
        confirmLabel: "确认驳回",
        confirmVariant: "danger",
        successTitle: "注册申请已驳回",
        successDetail: "该待审核账号已经删除。",
      };
    case "deleteAccount":
      return {
        title: "删除账号",
        message: `确认删除账号「${intent.memberName}」？该操作会清理相关关联数据，删除后不可恢复。`,
        confirmLabel: "确认删除",
        confirmVariant: "danger",
        successTitle: "账号已删除",
        successDetail: "该账号和相关关联数据已经清理。",
      };
    case "deleteGroup":
      return {
        title: "删除分组",
        message: `确认删除分组「${intent.groupName}」？组内账号会自动变为未分组，账号本身不会被删除。`,
        confirmLabel: "确认删除",
        confirmVariant: "danger",
        successTitle: "分组已删除",
        successDetail: "组内账号已转为未分组。",
      };
  }
};
