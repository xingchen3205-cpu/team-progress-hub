import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildTeamManagementConfirmation } from "../src/lib/team-confirmation";

describe("team management confirmations", () => {
  it("requires confirmation before changing a member role", () => {
    assert.deepEqual(
      buildTeamManagementConfirmation({
        type: "roleChange",
        memberName: "张星云",
        fromRole: "团队成员",
        toRole: "项目负责人",
      }),
      {
        title: "确认调整角色",
        message: "确认将「张星云」的角色从「团队成员」调整为「项目负责人」？角色变更后权限会立即变化。",
        confirmLabel: "确认调整",
        confirmVariant: "primary",
        successTitle: "角色已更新",
        successDetail: "账号权限已经按新角色生效。",
      },
    );
  });

  it("requires confirmation before moving a member between team groups", () => {
    assert.deepEqual(
      buildTeamManagementConfirmation({
        type: "groupChange",
        memberName: "李老师",
        fromGroupName: "南铁院一队",
        toGroupName: "未分组",
      }),
      {
        title: "确认调整分组",
        message: "确认将「李老师」从「南铁院一队」调整到「未分组」？调整后该账号可见范围会立即变化。",
        confirmLabel: "确认调整",
        confirmVariant: "primary",
        successTitle: "分组已更新",
        successDetail: "账号所属分组已经同步。",
      },
    );
  });

  it("uses explicit wording for registration approval and rejection", () => {
    assert.equal(
      buildTeamManagementConfirmation({
        type: "approveRegistration",
        memberName: "王评委",
        roleLabel: "评审专家",
      }).message,
      "确认通过「王评委」的「评审专家」账号申请？通过后该账号可以登录系统。",
    );

    assert.equal(
      buildTeamManagementConfirmation({
        type: "rejectRegistration",
        memberName: "王评委",
      }).message,
      "确认驳回并删除「王评委」的注册申请？该操作不可恢复。",
    );
  });
});
