import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildDocumentReworkTaskTitle,
  getDocumentReworkInitialStatus,
  shouldCreateDocumentReworkTask,
} from "../src/lib/document-rework-task";

describe("document rework task helpers", () => {
  it("creates rework tasks only for document revision actions", () => {
    assert.equal(shouldCreateDocumentReworkTask("leaderRevision"), true);
    assert.equal(shouldCreateDocumentReworkTask("teacherRevision"), true);
    assert.equal(shouldCreateDocumentReworkTask("leaderApprove"), false);
    assert.equal(shouldCreateDocumentReworkTask("teacherApprove"), false);
  });

  it("uses a consistent title for document rework tasks", () => {
    assert.equal(buildDocumentReworkTaskTitle("商业计划书"), "修改文档：商业计划书");
  });

  it("auto-accepts rework tasks assigned to project leaders only", () => {
    assert.equal(getDocumentReworkInitialStatus("leader"), "doing");
    assert.equal(getDocumentReworkInitialStatus("member"), "todo");
    assert.equal(getDocumentReworkInitialStatus("teacher"), "todo");
  });
});
