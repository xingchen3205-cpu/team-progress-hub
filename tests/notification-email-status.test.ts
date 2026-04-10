import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getNotificationEmailStatusMeta } from "../src/lib/notification-email-status";

describe("notification email status display", () => {
  it("labels successful email reminders without mentioning in-app read state", () => {
    assert.deepEqual(getNotificationEmailStatusMeta("sent"), {
      label: "邮件已发送",
      tone: "success",
      detail: "对方邮箱已收到本次提醒。",
    });
  });

  it("keeps skipped email reminders focused on the email reason", () => {
    assert.deepEqual(getNotificationEmailStatusMeta("skipped", "收件人未填写邮箱"), {
      label: "未发送邮件",
      tone: "muted",
      detail: "收件人未填写邮箱",
    });
  });

  it("keeps historical reminders with no email status honest", () => {
    assert.deepEqual(getNotificationEmailStatusMeta(null), {
      label: "邮件状态未记录",
      tone: "muted",
      detail: "历史提醒未记录邮件发送结果。",
    });
  });

  it("labels failed email reminders as email delivery failures", () => {
    assert.deepEqual(getNotificationEmailStatusMeta("failed", "Resend 发信域名尚未完成验证"), {
      label: "邮件发送失败",
      tone: "danger",
      detail: "Resend 发信域名尚未完成验证",
    });
  });
});
