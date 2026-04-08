import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildTaskWorkflowSteps,
  canRemindTaskDispatch,
  getTaskAcceptedTimeLabel,
  pickTaskDispatchRecipientIds,
} from "../src/lib/task-workflow";

describe("task workflow recipients", () => {
  it("prefers project leaders for unassigned work order dispatch reminders", () => {
    assert.deepEqual(
      pickTaskDispatchRecipientIds({
        candidates: [
          { id: "teacher-1", role: "teacher" },
          { id: "leader-1", role: "leader" },
          { id: "leader-2", role: "leader" },
        ],
      }),
      ["leader-1", "leader-2"],
    );
  });

  it("falls back to teachers only when no project leader is available", () => {
    assert.deepEqual(
      pickTaskDispatchRecipientIds({
        candidates: [
          { id: "teacher-1", role: "teacher" },
          { id: "teacher-2", role: "teacher" },
        ],
      }),
      ["teacher-1", "teacher-2"],
    );
  });

  it("excludes the creator from dispatch reminders", () => {
    assert.deepEqual(
      pickTaskDispatchRecipientIds({
        candidates: [
          { id: "leader-1", role: "leader" },
          { id: "leader-2", role: "leader" },
          { id: "teacher-1", role: "teacher" },
        ],
        excludeUserIds: ["leader-1"],
      }),
      ["leader-2"],
    );
  });

  it("allows dispatch reminders only for unassigned todo work orders", () => {
    assert.equal(canRemindTaskDispatch({ status: "todo", assigneeId: null }), true);
    assert.equal(canRemindTaskDispatch({ status: "todo", assigneeId: "member-1" }), false);
    assert.equal(canRemindTaskDispatch({ status: "doing", assigneeId: null }), false);
  });

  it("describes the current workflow step and reviewer clearly", () => {
    assert.deepEqual(
      buildTaskWorkflowSteps({
        status: "review",
        assigneeId: "member-1",
        assigneeName: "张星云",
        reviewerName: "李老师",
      }),
      [
        { key: "submitted", label: "提报", state: "done", helper: "工单已创建" },
        { key: "assigned", label: "接取", state: "done", helper: "张星云已接取" },
        { key: "processing", label: "处理", state: "done", helper: "张星云已提交验收" },
        { key: "review", label: "验收", state: "current", helper: "李老师确认闭环" },
      ],
    );
  });

  it("does not show unaccepted wording for already active work orders without a recorded accept time", () => {
    assert.equal(
      getTaskAcceptedTimeLabel({
        status: "doing",
        assigneeId: "member-1",
        acceptedAt: null,
      }),
      "已接取（时间未记录）",
    );
    assert.equal(
      getTaskAcceptedTimeLabel({
        status: "review",
        assigneeId: "member-1",
        acceptedAt: null,
      }),
      "已接取（时间未记录）",
    );
    assert.equal(
      getTaskAcceptedTimeLabel({
        status: "todo",
        assigneeId: "member-1",
        acceptedAt: null,
      }),
      "待接取",
    );
  });
});
