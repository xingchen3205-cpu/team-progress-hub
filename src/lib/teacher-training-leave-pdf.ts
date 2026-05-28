import type { TeacherTrainingLeaveRequestItem } from "@/lib/teacher-training";

type LeavePdfInput = {
  cohortTitle: string;
  participantName: string;
  organization: string;
  leaveRequest: TeacherTrainingLeaveRequestItem;
};

const pageWidth = 595;
const pageHeight = 842;
const margin = 54;

const toUtf16BeHex = (value: string) => {
  const buffer = Buffer.from(value, "utf16le");
  for (let index = 0; index < buffer.length; index += 2) {
    const first = buffer[index];
    buffer[index] = buffer[index + 1];
    buffer[index + 1] = first;
  }

  return buffer.toString("hex").toUpperCase();
};

const text = (value: string, x: number, y: number, size = 11) =>
  `BT /F1 ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm <${toUtf16BeHex(value)}> Tj ET\n`;

const line = (x1: number, y1: number, x2: number, y2: number) =>
  `${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S\n`;

const rect = (x: number, y: number, width: number, height: number) =>
  `${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re S\n`;

const wrapText = (value: string, maxUnits: number) => {
  const lines: string[] = [];
  let current = "";
  let currentUnits = 0;
  for (const char of value.replace(/\r/g, "").split("")) {
    if (char === "\n") {
      lines.push(current);
      current = "";
      currentUnits = 0;
      continue;
    }
    const units = /[\u0000-\u00ff]/.test(char) ? 1 : 2;
    if (current && currentUnits + units > maxUnits) {
      lines.push(current);
      current = char;
      currentUnits = units;
    } else {
      current += char;
      currentUnits += units;
    }
  }
  if (current) {
    lines.push(current);
  }

  return lines.length ? lines : [""];
};

const decisionLabel = (decision: string) => {
  if (decision === "approve") return "同意";
  if (decision === "reject") return "不同意";
  return "待审批";
};

const buildContentStream = ({ cohortTitle, participantName, organization, leaveRequest }: LeavePdfInput) => {
  let content = "0.8 w\n";
  content += text("江苏省职业院校创新创业教育（竞赛）指导能力提升培训", margin, 790, 16);
  content += text("参训教师请假单", 230, 760, 22);
  content += line(margin, 744, pageWidth - margin, 744);

  const rowTop = 710;
  const rowHeight = 34;
  const tableX = margin;
  const tableWidth = pageWidth - margin * 2;
  const labelWidth = 86;
  content += rect(tableX, rowTop - rowHeight * 4, tableWidth, rowHeight * 4);
  for (let row = 1; row < 4; row += 1) {
    content += line(tableX, rowTop - rowHeight * row, tableX + tableWidth, rowTop - rowHeight * row);
  }
  content += line(tableX + labelWidth, rowTop, tableX + labelWidth, rowTop - rowHeight * 4);
  content += line(tableX + tableWidth / 2, rowTop, tableX + tableWidth / 2, rowTop - rowHeight * 4);
  content += line(tableX + tableWidth / 2 + labelWidth, rowTop, tableX + tableWidth / 2 + labelWidth, rowTop - rowHeight * 4);

  const rows = [
    ["请假人", participantName, "所在单位", organization],
    ["培训班次", cohortTitle, "申请状态", leaveRequest.statusLabel],
    ["请假日期", `${leaveRequest.startDate} 至 ${leaveRequest.endDate}`, "请假场次", leaveRequest.sessionLabel],
    ["提交时间", leaveRequest.submittedAt, "完成时间", leaveRequest.completedAt || "未完成"],
  ];
  rows.forEach((row, index) => {
    const y = rowTop - 22 - rowHeight * index;
    content += text(row[0], tableX + 10, y, 10);
    content += text(row[1], tableX + labelWidth + 10, y, 10);
    content += text(row[2], tableX + tableWidth / 2 + 10, y, 10);
    content += text(row[3], tableX + tableWidth / 2 + labelWidth + 10, y, 10);
  });

  let y = 548;
  content += text("请假理由", margin, y, 13);
  y -= 20;
  content += rect(margin, y - 78, tableWidth, 88);
  wrapText(leaveRequest.reason, 58)
    .slice(0, 4)
    .forEach((lineText, index) => {
      content += text(lineText, margin + 14, y - 14 - index * 18, 11);
    });

  y -= 118;
  content += text("请假人签名：____________________", margin, y, 12);
  content += text("日期：________年____月____日", 330, y, 12);

  y -= 46;
  content += text("审批记录", margin, y, 13);
  y -= 16;
  const approvalRows = leaveRequest.approvalSteps.map((step) => {
    const approvals = leaveRequest.approvals.filter((approval) => approval.stepKey === step.key);
    return {
      step,
      approvals,
    };
  });
  const approvalBoxHeight = 92;
  approvalRows.slice(0, 3).forEach(({ step, approvals }, index) => {
    const boxY = y - approvalBoxHeight * (index + 1);
    content += rect(margin, boxY, tableWidth, approvalBoxHeight - 10);
    content += text(`${step.name}（需 ${step.requiredCount} 人同意）`, margin + 12, boxY + approvalBoxHeight - 30, 11);
    if (approvals.length === 0) {
      content += text("审批意见：待审批", margin + 12, boxY + approvalBoxHeight - 52, 11);
      content += text("审批人签名：____________________", margin + 12, boxY + 14, 11);
    } else {
      approvals.slice(0, 2).forEach((approval, approvalIndex) => {
        const approvalY = boxY + approvalBoxHeight - 52 - approvalIndex * 22;
        content += text(
          `${approval.approverName}：${decisionLabel(approval.decision)} ${approval.comment || ""}`,
          margin + 12,
          approvalY,
          10,
        );
        content += text(`时间：${approval.reviewedAt}`, 360, approvalY, 10);
      });
      content += text("审批人签名：____________________", margin + 12, boxY + 14, 11);
    }
  });

  content += line(margin, 42, pageWidth - margin, 42);
  content += text("本单由南京铁道职业技术学院创新创业管理平台生成。", margin, 24, 9);

  return content;
};

export const buildTeacherTrainingLeaveRequestPdf = (input: LeavePdfInput) => {
  const content = buildContentStream(input);
  const contentBuffer = Buffer.from(content, "utf8");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 4 0 R >> >> /Contents 7 0 R >>`,
    "<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /UniGB-UCS2-H /DescendantFonts [5 0 R] >>",
    "<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 2 >> /FontDescriptor 6 0 R >>",
    "<< /Type /FontDescriptor /FontName /STSong-Light /Flags 6 /FontBBox [0 -200 1000 900] /ItalicAngle 0 /Ascent 880 /Descent -120 /CapHeight 880 /StemV 80 >>",
    `<< /Length ${contentBuffer.length} >>\nstream\n${content}endstream`,
  ];
  const chunks: Buffer[] = [Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n", "binary")];
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.concat(chunks).length);
    chunks.push(Buffer.from(`${index + 1} 0 obj\n${object}\nendobj\n`, "utf8"));
  });
  const xrefOffset = Buffer.concat(chunks).length;
  const xrefRows = ["xref", `0 ${objects.length + 1}`, "0000000000 65535 f "];
  offsets.slice(1).forEach((offset) => {
    xrefRows.push(`${String(offset).padStart(10, "0")} 00000 n `);
  });
  chunks.push(
    Buffer.from(
      `${xrefRows.join("\n")}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
      "utf8",
    ),
  );

  return Buffer.concat(chunks);
};
