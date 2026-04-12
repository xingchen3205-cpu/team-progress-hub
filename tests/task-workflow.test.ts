import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildTaskWorkflowSteps,
  canRemindTaskDispatch,
  deriveTaskStatusFromAssignments,
  getTaskReminderActionLabel,
  getTaskAcceptedTimeLabel,
  getTaskReviewerLabel,
  pickTaskDispatchRecipientIds,
  summarizeTaskAssignments,
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

  it("labels dispatch reminder actions clearly for unassigned work orders", () => {
    assert.equal(getTaskReminderActionLabel({ status: "todo", assigneeId: null }), "提醒分配");
    assert.equal(getTaskReminderActionLabel({ status: "todo", assigneeId: "member-1" }), "提醒");
    assert.equal(getTaskReminderActionLabel({ status: "doing", assigneeId: "member-1" }), "提醒");
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

  it("shows multi-assignee progress clearly before the task can move to review", () => {
    assert.deepEqual(
      buildTaskWorkflowSteps({
        status: "doing",
        assigneeId: "member-1",
        assigneeName: "张星云、梁家铭",
        reviewerName: "李老师",
        assigneeCount: 3,
        acceptedCount: 2,
        submittedCount: 1,
      }),
      [
        { key: "submitted", label: "提报", state: "done", helper: "工单已创建" },
        { key: "assigned", label: "接取", state: "done", helper: "2/3 人已接取" },
        { key: "processing", label: "处理", state: "current", helper: "1/3 人已提交，待全部完成" },
        { key: "review", label: "验收", state: "pending", helper: "李老师确认闭环" },
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
    assert.equal(
      getTaskAcceptedTimeLabel({
        status: "doing",
        assigneeId: "member-1",
        assigneeCount: 3,
        acceptedCount: 2,
        acceptedAt: null,
      }),
      "2/3 人已接取",
    );
  });

  it("does not show pending reviewer wording for archived work orders without a recorded reviewer", () => {
    assert.equal(
      getTaskReviewerLabel({
        status: "archived",
        reviewerName: null,
      }),
      "已归档（验收人未记录）",
    );
    assert.equal(
      getTaskReviewerLabel({
        status: "review",
        reviewerName: null,
      }),
      "待本队教师/负责人确认",
    );
    assert.equal(
      getTaskReviewerLabel({
        status: "done",
        reviewerName: "李老师",
      }),
      "李老师",
    );
  });

  it("summarizes multi-assignee progress and only enters review when everyone has submitted", () => {
    assert.deepEqual(
      summarizeTaskAssignments({
        assigneeIds: ["member-1", "member-2", "member-3"],
        acceptedAtValues: ["2026-04-09 10:00", "2026-04-09 10:05", null],
        submittedAtValues: ["2026-04-09 11:00", null, null],
      }),
      { total: 3, accepted: 2, submitted: 1 },
    );

    assert.equal(
      deriveTaskStatusFromAssignments({
        assigneeIds: ["member-1", "member-2"],
        acceptedAtValues: [null, null],
        submittedAtValues: [null, null],
      }),
      "todo",
    );
    assert.equal(
      deriveTaskStatusFromAssignments({
        assigneeIds: ["member-1", "member-2"],
        acceptedAtValues: ["2026-04-09 10:00", null],
        submittedAtValues: [null, null],
      }),
      "doing",
    );
    assert.equal(
      deriveTaskStatusFromAssignments({
        assigneeIds: ["member-1", "member-2"],
        acceptedAtValues: ["2026-04-09 10:00", "2026-04-09 10:03"],
        submittedAtValues: ["2026-04-09 10:40", "2026-04-09 10:41"],
      }),
      "review",
    );
  });
});
