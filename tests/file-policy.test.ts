import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { validateUploadMeta } from "../src/lib/file-policy";

describe("file upload policy", () => {
  it("keeps archives blocked by default", () => {
    assert.equal(
      validateUploadMeta({
        fileName: "项目材料.zip",
        fileSize: 1024,
      }),
      "不支持该文件格式",
    );
  });

  it("allows archives only when the caller explicitly opts in", () => {
    assert.equal(
      validateUploadMeta(
        {
          fileName: "项目材料.zip",
          fileSize: 1024,
        },
        { allowArchives: true },
      ),
      null,
    );
  });

  it("still rejects PPT source files even when archives are enabled", () => {
    assert.equal(
      validateUploadMeta(
        {
          fileName: "路演材料.pptx",
          fileSize: 1024,
        },
        { allowArchives: true },
      ),
      "不支持该文件格式",
    );
  });
});
