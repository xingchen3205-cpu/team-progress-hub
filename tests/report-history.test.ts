import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildReportDateOptions, getReportAttachmentNote } from "../src/lib/report-history";

describe("report history date options", () => {
  it("keeps saved report dates while allowing the currently selected date", () => {
    assert.deepEqual(
      buildReportDateOptions({
        reportDates: ["2026-04-01", "2026-04-06"],
        selectedDate: "2026-03-28",
        todayDateKey: "2026-04-08",
        daysBack: 3,
      }),
      ["2026-04-08", "2026-04-07", "2026-04-06", "2026-04-05", "2026-04-01", "2026-03-28"],
    );
  });

  it("deduplicates dates and sorts newest first", () => {
    assert.deepEqual(
      buildReportDateOptions({
        reportDates: ["2026-04-07", "2026-04-08", "2026-04-07"],
        selectedDate: "2026-04-08",
        todayDateKey: "2026-04-08",
        daysBack: 1,
      }),
      ["2026-04-08", "2026-04-07"],
    );
  });

  it("hides empty report attachment placeholders", () => {
    assert.equal(getReportAttachmentNote("未上传附件"), null);
    assert.equal(getReportAttachmentNote("   "), null);
    assert.equal(getReportAttachmentNote("日报截图.png"), "日报截图.png");
  });
});
