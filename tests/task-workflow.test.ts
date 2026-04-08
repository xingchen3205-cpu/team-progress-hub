import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { canRemindTaskDispatch, pickTaskDispatchRecipientIds } from "../src/lib/task-workflow";

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
});
