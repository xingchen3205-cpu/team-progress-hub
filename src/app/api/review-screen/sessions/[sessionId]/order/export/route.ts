import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { buildAttachmentDisposition } from "@/lib/downloads";
import { assertRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const formatDateTime = (value?: Date | null) => {
  if (!value) return "";
  const formatter = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  return formatter.format(value).replaceAll("/", "-");
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  try {
    assertRole(user.role, ["admin", "school_admin"]);
  } catch {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const { sessionId } = await params;
  const session = await prisma.reviewDisplaySession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      createdAt: true,
      startsAt: true,
      screenPhase: true,
      selfDrawEnabled: true,
      reviewPackage: {
        select: {
          targetName: true,
          roundLabel: true,
          projectReviewStage: {
            select: {
              name: true,
            },
          },
        },
      },
      projectOrders: {
        orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
        select: {
          orderIndex: true,
          groupName: true,
          groupIndex: true,
          groupSlotIndex: true,
          selfDrawnAt: true,
          revealedAt: true,
          reviewPackage: {
            select: {
              targetName: true,
              roundLabel: true,
            },
          },
        },
      },
    },
  });

  if (!session) {
    return NextResponse.json({ message: "大屏会话不存在" }, { status: 404 });
  }

  const title = session.reviewPackage.projectReviewStage?.name || session.reviewPackage.roundLabel || "路演评审";
  const exportedAt = new Date();
  const confirmedCount = session.projectOrders.filter((order) => order.selfDrawnAt).length;
  const drawMethod = session.selfDrawEnabled ? "项目自助抽签" : "管理员随机/手动确认";
  const orderStatus = confirmedCount >= session.projectOrders.length
    ? "顺序已全部确认"
    : `已确认 ${confirmedCount} 项，剩余 ${session.projectOrders.length - confirmedCount} 项待抽签`;
  const rows = session.projectOrders.map((order) => `
    <tr>
      <td>${order.selfDrawnAt ? order.orderIndex + 1 : "待抽签"}</td>
      <td>${order.selfDrawnAt ? "已完成抽签" : "待抽取上台项目"}</td>
      <td>${escapeHtml(order.reviewPackage.targetName)}</td>
      <td>${escapeHtml(order.reviewPackage.roundLabel || session.reviewPackage.roundLabel || "")}</td>
      <td>${escapeHtml(order.groupName || `第 ${order.groupIndex + 1} 组`)}</td>
      <td>${order.groupSlotIndex + 1}</td>
      <td>${escapeHtml(order.selfDrawnAt ? "已确认" : "待抽签")}</td>
      <td>${formatDateTime(order.selfDrawnAt)}</td>
      <td>${order.revealedAt ? "已完成" : "未开始/未完成"}</td>
    </tr>
  `).join("");
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <style>
    table { border-collapse: collapse; width: 100%; font-family: "Microsoft YaHei", Arial, sans-serif; }
    th, td { border: 1px solid #9ca3af; padding: 8px 10px; text-align: left; }
    th { background: #e8eef8; font-weight: 700; }
    .meta td { background: #f8fafc; font-weight: 700; }
  </style>
</head>
<body>
  <table>
    <tr class="meta"><td colspan="9">南京铁道职业技术学院路演顺序表</td></tr>
    <tr class="meta"><td>评审名称</td><td colspan="8">${escapeHtml(title)}</td></tr>
    <tr class="meta"><td>导出时间</td><td colspan="8">${formatDateTime(exportedAt)}</td></tr>
    <tr class="meta"><td>抽签方式</td><td colspan="8">${escapeHtml(drawMethod)}</td></tr>
    <tr class="meta"><td>顺序状态</td><td colspan="8">${escapeHtml(orderStatus)}</td></tr>
    <tr class="meta"><td>项目数量</td><td colspan="8">${session.projectOrders.length}</td></tr>
    <tr>
      <th>路演顺序</th>
      <th>候抽状态</th>
      <th>项目名称</th>
      <th>评审轮次</th>
      <th>分组</th>
      <th>组内序号</th>
      <th>顺序确认状态</th>
      <th>抽签/确认时间</th>
      <th>评审状态</th>
    </tr>
    ${rows}
  </table>
</body>
</html>`;
  const fileName = `路演顺序表-${title}-${formatDateTime(exportedAt).replaceAll(":", "")}.xls`;

  return new NextResponse(`\ufeff${html}`, {
    headers: {
      "Content-Type": "application/vnd.ms-excel; charset=utf-8",
      "Content-Disposition": buildAttachmentDisposition(fileName),
      "Cache-Control": "no-store",
    },
  });
}
