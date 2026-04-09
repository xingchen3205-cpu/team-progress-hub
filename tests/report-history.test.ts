import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getAdminReportViewFilter,
  buildReportDateOptions,
  getAdminReportDeleteFilter,
  getReportAttachmentNote,
  getVisibleReportMembers,
} from "../src/lib/report-history";

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

  it("builds a safe admin report deletion filter scoped to one team group and date", () => {
    assert.deepEqual(
      getAdminReportDeleteFilter({
        date: "2026-04-08",
        teamGroupId: "group-1",
      }),
      {
        date: "2026-04-08",
        user: {
          teamGroupId: "group-1",
        },
      },
    );
  });

  it("refuses admin report deletion without a valid team group or date", () => {
    assert.equal(getAdminReportDeleteFilter({ date: "", teamGroupId: "group-1" }), null);
    assert.equal(getAdminReportDeleteFilter({ date: "2026-04-08", teamGroupId: "" }), null);
    assert.equal(getAdminReportDeleteFilter({ date: "not-a-date", teamGroupId: "group-1" }), null);
  });

  it("builds an admin report view filter scoped to one team group", () => {
    assert.deepEqual(getAdminReportViewFilter("group-1"), {
      user: {
        teamGroupId: "group-1",
        role: {
          in: ["leader", "member"],
        },
      },
    });
  });

  it("returns undefined admin report view filter when no team group is selected", () => {
    assert.equal(getAdminReportViewFilter(""), undefined);
    assert.equal(getAdminReportViewFilter(null), undefined);
  });

  it("excludes ungrouped former team members from report expected lists", () => {
    const members = [
      { id: "leader-1", systemRole: "项目负责人", teamGroupId: "group-1" },
      { id: "member-1", systemRole: "团队成员", teamGroupId: "group-1" },
      { id: "former-member", systemRole: "团队成员", teamGroupId: null },
      { id: "teacher-1", systemRole: "指导教师", teamGroupId: "group-1" },
      { id: "expert-1", systemRole: "评审专家", teamGroupId: null },
    ];

    assert.deepEqual(
      getVisibleReportMembers({
        members,
        currentMemberId: "admin-1",
        canViewAllReports: true,
      }).map((member) => member.id),
      ["leader-1", "member-1"],
    );

    assert.deepEqual(
      getVisibleReportMembers({
        members,
        currentMemberId: "admin-1",
        canViewAllReports: true,
        selectedTeamGroupId: "group-1",
      }).map((member) => member.id),
      ["leader-1", "member-1"],
    );

    assert.deepEqual(
      getVisibleReportMembers({
        members,
        currentMemberId: "admin-1",
        canViewAllReports: true,
        selectedTeamGroupId: "group-2",
      }).map((member) => member.id),
      [],
    );

    assert.deepEqual(
      getVisibleReportMembers({
        members,
        currentMemberId: "former-member",
        canViewAllReports: false,
      }).map((member) => member.id),
      ["former-member"],
    );
  });
});
