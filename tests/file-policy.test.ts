import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MAX_DOCUMENT_CENTER_UPLOAD_SIZE,
  MAX_UPLOAD_SIZE,
  validateDocumentCenterUploadMeta,
  validateUploadMeta,
} from "../src/lib/file-policy";

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

  it("keeps normal uploads at 20MB while allowing document center uploads up to 100MB", () => {
    assert.equal(
      validateUploadMeta({
        fileName: "项目材料.pdf",
        fileSize: MAX_UPLOAD_SIZE + 1,
      }),
      "文件大小不能超过 20MB",
    );

    assert.equal(
      validateDocumentCenterUploadMeta({
        fileName: "项目材料.zip",
        fileSize: 90 * 1024 * 1024,
      }),
      null,
    );

    assert.equal(
      validateDocumentCenterUploadMeta({
        fileName: "项目材料.zip",
        fileSize: MAX_DOCUMENT_CENTER_UPLOAD_SIZE + 1,
      }),
      "文件大小不能超过 100MB",
    );
  });

  it("rejects explicit mime types that conflict with the file extension", () => {
    assert.equal(
      validateUploadMeta({
        fileName: "项目材料.pdf",
        fileSize: 1024,
        mimeType: "image/png",
      }),
      "文件类型与扩展名不匹配",
    );

    assert.equal(
      validateDocumentCenterUploadMeta({
        fileName: "项目资料.zip",
        fileSize: 1024,
        mimeType: "application/zip",
      }),
      null,
    );
  });
});
