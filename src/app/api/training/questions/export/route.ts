import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { assertMainWorkspaceRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { buildTeamScopedResourceWhere } from "@/lib/team-scope";

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const normalizeFilename = (value: string) => value.replace(/[\\/:*?"<>|]/g, "-").slice(0, 80) || "答辩题库";

export async function GET(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  try {
    assertMainWorkspaceRole(user.role);
  } catch {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const keyword = request.nextUrl.searchParams.get("q")?.trim().toLowerCase() ?? "";
  const category = request.nextUrl.searchParams.get("category")?.trim() ?? "";
  const teamGroupId = request.nextUrl.searchParams.get("teamGroupId")?.trim() ?? "visible";
  const systemAdminCanChooseTeam = user.role === "admin";
  const scopedWhere = buildTeamScopedResourceWhere({
    actor: user,
    ownerField: "createdById",
  });
  const teamWhere =
    systemAdminCanChooseTeam && teamGroupId !== "visible" && teamGroupId !== "all"
      ? teamGroupId === "unassigned"
        ? { teamGroupId: null }
        : { teamGroupId }
      : {};

  const questions = await prisma.trainingQuestion.findMany({
    where: {
      ...scopedWhere,
      ...teamWhere,
    },
    orderBy: [{ teamGroupId: "asc" }, { category: "asc" }, { createdAt: "desc" }],
    include: {
      createdBy: {
        select: { name: true },
      },
      teamGroup: {
        select: { name: true },
      },
    },
  });

  const visibleQuestions = keyword
    ? questions.filter((item) =>
        [item.question, item.answerPoints, item.category, item.createdBy.name, item.teamGroup?.name ?? "未分组题库"]
          .some((value) => value.toLowerCase().includes(keyword)),
      )
    : questions;
  const filteredQuestions = category
    ? visibleQuestions.filter((item) => item.category === category)
    : visibleQuestions;
  const scopeLabel =
    systemAdminCanChooseTeam && teamGroupId && teamGroupId !== "visible" && teamGroupId !== "all"
      ? teamGroupId === "unassigned"
        ? "未分组题库"
        : filteredQuestions[0]?.teamGroup?.name ?? visibleQuestions[0]?.teamGroup?.name ?? "团队题库"
      : user.role === "admin"
        ? "全部团队题库"
        : "当前可见题库";

  const questionBlocks = filteredQuestions
    .map(
      (item, index) => `
        <section class="question-block">
          <p class="sequence">序号：${index + 1}</p>
          <p><strong>题目类型：</strong>${escapeHtml(item.category)}</p>
          <p><strong>题目：</strong>${escapeHtml(item.question)}</p>
          <p><strong>标准答案：</strong></p>
          <p class="answer">${escapeHtml(item.answerPoints).replaceAll("\n", "<br />")}</p>
        </section>
      `,
    )
    .join("");

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(scopeLabel)} - 答辩题库</title>
  <style>
    body { font-family: "Microsoft YaHei", SimSun, sans-serif; color: #111827; }
    h1 { font-size: 22px; margin: 0 0 18px; text-align: center; }
    p { font-size: 12pt; line-height: 1.8; margin: 4px 0; }
    .question-block { margin: 0 0 18px; padding-bottom: 14px; border-bottom: 1px solid #d8dee9; page-break-inside: avoid; }
    .sequence { font-weight: 700; }
    .answer { margin-left: 2em; white-space: normal; }
  </style>
</head>
<body>
  <h1>${escapeHtml(scopeLabel)} - 答辩题库</h1>
  ${questionBlocks || `<p>当前范围内没有题目</p>`}
</body>
</html>`;

  const filename = `${normalizeFilename(scopeLabel)}-答辩题库.doc`;

  return new NextResponse(`\uFEFF${html}`, {
    headers: {
      "Content-Type": "application/msword; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
