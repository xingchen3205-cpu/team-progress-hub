import assert from "node:assert/strict";
import test from "node:test";

import { inferTaskTeamGroupId } from "@/lib/task-team-group";

test("inferTaskTeamGroupId returns explicit task team group first", () => {
  assert.equal(
    inferTaskTeamGroupId({
      teamGroupId: "group-task",
      creator: { teamGroupId: "group-creator" },
    }),
    "group-task",
  );
});

test("inferTaskTeamGroupId falls back to creator, reviewer, assignee, then assignments", () => {
  assert.equal(
    inferTaskTeamGroupId({
      creator: { teamGroupId: "group-creator" },
    }),
    "group-creator",
  );

  assert.equal(
    inferTaskTeamGroupId({
      reviewer: { teamGroupId: "group-reviewer" },
    }),
    "group-reviewer",
  );

  assert.equal(
    inferTaskTeamGroupId({
      assignee: { teamGroupId: "group-assignee" },
    }),
    "group-assignee",
  );

  assert.equal(
    inferTaskTeamGroupId({
      assignments: [{ assignee: { teamGroupId: "group-assignment" } }],
    }),
    "group-assignment",
  );
});

test("inferTaskTeamGroupId returns null when no related group exists", () => {
  assert.equal(
    inferTaskTeamGroupId({
      teamGroupId: null,
      creator: { teamGroupId: null },
      reviewer: null,
      assignee: { teamGroupId: null },
      assignments: [],
    }),
    null,
  );
});
