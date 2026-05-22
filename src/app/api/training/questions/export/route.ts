import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { formatBeijingDateTime } from "@/lib/date";
import { assertMainWorkspaceRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { buildTeamScopedResourceWhere } from "@/lib/team-scope";
import { getTrainingQuestionRevisionMeta } from "@/lib/training-question-revisions";

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
  const now = formatBeijingDateTime(new Date());
  const revisionMetaByQuestionId = await getTrainingQuestionRevisionMeta(filteredQuestions.map((question) => question.id));

  const rows = filteredQuestions
    .map((item, index) => {
      const revision = revisionMetaByQuestionId.get(item.id);

      return `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(item.teamGroup?.name ?? "未分组题库")}</td>
          <td>${escapeHtml(item.category)}</td>
          <td>${escapeHtml(item.question)}</td>
          <td>${escapeHtml(item.answerPoints).replaceAll("\n", "<br />")}</td>
          <td>${escapeHtml(item.createdBy.name)}</td>
          <td>${revision ? `${escapeHtml(revision.lastEditedByName)}<br />${escapeHtml(formatBeijingDateTime(revision.lastEditedAt))}` : "未修订"}</td>
        </tr>
      `;
    })
    .join("");

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(scopeLabel)} - 答辩题库</title>
  <style>
    body { font-family: "Microsoft YaHei", SimSun, sans-serif; color: #111827; }
    h1 { font-size: 22px; margin-bottom: 6px; }
    .meta { color: #64748b; font-size: 12px; margin-bottom: 18px; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th, td { border: 1px solid #cbd5e1; padding: 8px; vertical-align: top; font-size: 11px; line-height: 1.6; }
    th { background: #eef5ff; color: #0f2040; font-weight: 700; }
    td:nth-child(1) { width: 36px; text-align: center; }
    td:nth-child(2) { width: 96px; }
    td:nth-child(3) { width: 76px; }
    td:nth-child(6) { width: 76px; }
    td:nth-child(7) { width: 110px; }
  </style>
</head>
<body>
  <h1>${escapeHtml(scopeLabel)} - 答辩题库</h1>
  <div class="meta">导出时间：${escapeHtml(now)}；题目数量：${filteredQuestions.length} 题${keyword ? `；关键词：${escapeHtml(keyword)}` : ""}${category ? `；分类：${escapeHtml(category)}` : ""}</div>
  <table>
    <thead>
      <tr>
        <th>序号</th>
        <th>团队</th>
        <th>分类</th>
        <th>评委可能提问</th>
        <th>标准回答要点</th>
        <th>录入人</th>
        <th>最近修订</th>
      </tr>
    </thead>
    <tbody>
      ${
        rows ||
        `<tr><td colspan="7" style="text-align:center;color:#64748b;">当前范围内没有题目</td></tr>`
      }
    </tbody>
  </table>
</body>
</html>`;

  const filename = `${normalizeFilename(scopeLabel)}-答辩题库-${new Date().toISOString().slice(0, 10)}.doc`;

  return new NextResponse(`\uFEFF${html}`, {
    headers: {
      "Content-Type": "application/msword; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
