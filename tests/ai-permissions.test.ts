import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildAiPermissionSnapshot, resolveAiAccessState } from "../src/lib/ai-permissions.ts";

describe("ai permissions", () => {
  it("enables unlimited usage for global admins by default", () => {
    const snapshot = buildAiPermissionSnapshot("admin", null);

    assert.equal(snapshot.isEnabled, true);
    assert.equal(snapshot.maxCount, null);
    assert.equal(snapshot.usedCount, 0);
    assert.equal(snapshot.remainingCount, null);
    assert.equal(resolveAiAccessState(snapshot), "allowed");
  });

  it("disables usage by default for regular members without an explicit permission row", () => {
    const snapshot = buildAiPermissionSnapshot("member", null);

    assert.equal(snapshot.isEnabled, false);
    assert.equal(snapshot.maxCount, 0);
    assert.equal(snapshot.usedCount, 0);
    assert.equal(snapshot.remainingCount, 0);
    assert.equal(resolveAiAccessState(snapshot), "disabled");
  });

  it("keeps expert accounts disabled for AI assistant access", () => {
    const snapshot = buildAiPermissionSnapshot("expert", {
      isEnabled: true,
      maxCount: null,
      usedCount: 0,
      resetAt: null,
    });

    assert.equal(snapshot.isEnabled, false);
    assert.equal(snapshot.maxCount, 0);
    assert.equal(snapshot.remainingCount, 0);
    assert.equal(resolveAiAccessState(snapshot), "disabled");
  });

  it("resets consumed counts after reset_at has passed", () => {
    const snapshot = buildAiPermissionSnapshot(
      "teacher",
      {
        isEnabled: true,
        maxCount: 5,
        usedCount: 4,
        resetAt: new Date("2026-04-19T00:00:00.000Z"),
      },
      new Date("2026-04-20T00:00:00.000Z"),
    );

    assert.equal(snapshot.usedCount, 0);
    assert.equal(snapshot.remainingCount, 5);
    assert.equal(snapshot.shouldReset, true);
    assert.equal(resolveAiAccessState(snapshot), "allowed");
  });

  it("marks limited accounts as exhausted once they reach max_count", () => {
    const snapshot = buildAiPermissionSnapshot("teacher", {
      isEnabled: true,
      maxCount: 3,
      usedCount: 3,
      resetAt: null,
    });

    assert.equal(snapshot.remainingCount, 0);
    assert.equal(resolveAiAccessState(snapshot), "limit_reached");
  });
});
