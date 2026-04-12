import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { renderSystemEmail } from "../src/lib/email";

describe("system email template", () => {
  it("renders a formal work reminder slip with recipient, type, title, requirement, link, and sent time", () => {
    const html = renderSystemEmail({
      title: "文档待负责人审批",
      detail: "梁家铭上传了《商业计划书 v2.0》，请及时登录系统完成审核。",
      actionUrl: "https://xingchencxcy.com/workspace?tab=documents",
      actionLabel: "进入系统办理",
      recipientName: "张星云",
      noticeType: "文档审批",
      sentAt: new Date("2026-04-08T14:39:00.000Z"),
    });

    assert.match(html, /南京铁道职业技术学院大赛管理系统/);
    assert.match(html, /系统工作提醒单/);
    assert.match(html, /收件人/);
    assert.match(html, /张星云/);
    assert.match(html, /事项类型/);
    assert.match(html, /文档审批/);
    assert.match(html, /事项标题/);
    assert.match(html, /文档待负责人审批/);
    assert.match(html, /办理要求/);
    assert.match(html, /梁家铭上传了《商业计划书 v2\.0》/);
    assert.match(html, /办理入口/);
    assert.match(html, /进入系统办理/);
    assert.match(html, /https:\/\/xingchencxcy\.com\/workspace\?tab=documents/);
    assert.match(html, /发送时间/);
    assert.match(html, /2026年4月8日 22:39/);
    assert.match(html, /本邮件由南京铁道职业技术学院大赛管理系统自动发送，请勿直接回复/);
  });
});
