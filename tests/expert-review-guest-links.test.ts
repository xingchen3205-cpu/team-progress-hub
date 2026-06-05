import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const sourcePath = (filePath: string) => path.join(process.cwd(), filePath);
const readSource = (filePath: string) => readFileSync(sourcePath(filePath), "utf8");

describe("guest expert review links", () => {
  it("declares hashed guest expert tokens bound one-per-expert-stage", () => {
    const schema = readSource("prisma/schema.prisma");
    const tokenLib = readSource("src/lib/expert-review-guest-token.ts");
    const schemaScript = readSource("scripts/apply-guest-expert-review-schema.ts");

    assert.match(schema, /model ExpertReviewGuestToken/);
    assert.match(schema, /expertUserId\s+String/);
    assert.match(schema, /projectReviewStageId\s+String/);
    assert.match(schema, /tokenHash\s+String\s+@unique/);
    assert.match(schema, /@@unique\(\[expertUserId,\s*projectReviewStageId\]\)/);
    assert.match(tokenLib, /randomBytes\(32\)/);
    assert.match(tokenLib, /createHash\("sha256"\)/);
    assert.match(schemaScript, /CREATE TABLE IF NOT EXISTS/);
    assert.match(schemaScript, /ExpertReviewGuestToken/);
  });

  it("lets administrators generate one no-login link per expert instead of one link per project", () => {
    const route = readSource("src/app/api/expert-reviews/guest-links/route.ts");
    const revokeRoute = readSource("src/app/api/expert-reviews/guest-links/revoke/route.ts");

    assert.match(route, /assertRole\(user\.role,\s*\["admin",\s*"school_admin"\]\)/);
    assert.match(route, /expertReviewGuestToken\.upsert/);
    assert.match(route, /expertUserId_projectReviewStageId/);
    assert.match(route, /createExpertReviewGuestToken/);
    assert.match(route, /\/expert-review\/guest\//);
    assert.match(route, /assignmentCount/);
    assert.doesNotMatch(route, /packageId_projectReviewStageId/);
    assert.doesNotMatch(route, /projectLinks/);
    assert.match(revokeRoute, /assertRole\(user\.role,\s*\["admin",\s*"school_admin"\]\)/);
    assert.match(revokeRoute, /revokedAt:\s*now/);
  });

  it("allows guest experts to see only their assigned projects ordered by roadshow order", () => {
    const route = readSource("src/app/api/expert-reviews/guest/[token]/route.ts");

    assert.doesNotMatch(route, /getSessionUser/);
    assert.match(route, /getExpertReviewWindowState/);
    assert.match(route, /hashExpertReviewGuestToken/);
    assert.match(route, /revokedAt:\s*null/);
    assert.match(route, /tokenExpiresAt:\s*\{\s*gt:\s*now/);
    assert.match(route, /expertUserId:\s*guestToken\.expertUserId/);
    assert.match(route, /projectReviewStageId:\s*guestToken\.projectReviewStageId/);
    assert.match(route, /reviewDisplayProjectOrder\.findMany/);
    assert.match(route, /orderIndex/);
    assert.match(route, /reviewWindowState/);
    assert.match(route, /reviewWindowLabel/);
    assert.match(route, /completionMessage/);
  });

  it("allows guest scoring without login and without requiring the roadshow big screen", () => {
    const route = readSource("src/app/api/expert-reviews/guest/[token]/scores/route.ts");

    assert.doesNotMatch(route, /getSessionUser/);
    assert.doesNotMatch(route, /reviewDisplaySeat\.findFirst/);
    assert.doesNotMatch(route, /现场评分尚未开始/);
    assert.match(route, /hashExpertReviewGuestToken/);
    assert.match(route, /assignmentId/);
    assert.match(route, /expertUserId:\s*guestToken\.expertUserId/);
    assert.match(route, /projectReviewStageId:\s*guestToken\.projectReviewStageId/);
    assert.match(route, /Math\.round\(score \* 100\)/);
    assert.match(route, /expertReviewScore\.create/);
    assert.match(route, /reviewerId:\s*guestToken\.expertUserId/);
    assert.match(route, /lockedAt:\s*submittedAt/);
    assert.match(route, /status:\s*"submitted"/);
  });

  it("renders a standalone mobile guest scoring page with ordered projects and completion thanks", () => {
    const pagePath = "src/app/expert-review/guest/[token]/page.tsx";
    assert.equal(existsSync(sourcePath(pagePath)), true);
    const page = readSource(pagePath);

    assert.match(page, /\/api\/expert-reviews\/guest\/\$\{encodeURIComponent\(token\)\}/);
    assert.match(page, /projects/);
    assert.match(page, /pendingCount/);
    assert.match(page, /submittedCount/);
    assert.match(page, /\/scores/);
    assert.match(page, /official-logo\.png/);
    assert.match(page, /pendingSubmission/);
    assert.match(page, /确认提交评分/);
    assert.match(page, /reviewWindowState/);
    assert.match(page, /感谢/);
    assert.doesNotMatch(page, /workspace/);
  });

  it("keeps guest mobile scoring rigorous and advances to the next pending project", () => {
    const page = readSource("src/app/expert-review/guest/[token]/page.tsx");

    assert.doesNotMatch(page, /quickScoreOptions/);
    assert.doesNotMatch(page, /guest-review-quick-scores/);
    assert.doesNotMatch(page, /常用分值/);
    assert.match(page, /请手动输入 0\.00-100\.00 分/);
    assert.match(page, /guest-review-score-dock/);
    assert.match(page, /nextPendingProject/);
    assert.match(page, /preferredAssignmentId:\s*"next-pending"/);
    assert.match(page, /selectedCurrentProject\?\.status === "submitted"/);
    assert.match(page, /await load\(\{ preferredAssignmentId: "next-pending" \}\)/);
  });

  it("exposes admin controls for expert no-login links without creating per-project links", () => {
    const tab = readSource("src/components/tabs/expert-review-tab-content.tsx");

    assert.match(tab, /专家免登录评分链接/);
    assert.match(tab, /\/api\/expert-reviews\/guest-links/);
    assert.match(tab, /copyGuestExpertLink/);
    assert.match(tab, /assignmentCount/);
    assert.match(tab, /复制链接/);
    assert.doesNotMatch(tab, /项目评分链接/);
  });

  it("keeps admin score progress refreshing even when the big screen is not open", () => {
    const tab = readSource("src/components/tabs/expert-review-tab-content.tsx");

    assert.match(tab, /canManageReviewMaterials/);
    assert.match(tab, /refreshWorkspace\("reviewAssignments"\)/);
    assert.match(tab, /setInterval\(refreshAdminReviewAssignments,\s*5000\)/);
    assert.doesNotMatch(tab, /!canManageReviewMaterials \|\| Object\.keys\(reviewScreenSessions\)\.length === 0/);
  });
});
