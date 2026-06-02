import type { TeacherTrainingLeaveRequestItem } from "@/lib/teacher-training";

type LeavePdfInput = {
  cohortTitle: string;
  cohortStartDate?: string;
  leaveSequence?: number;
  participantName: string;
  participantTitle?: string;
  organization: string;
  leaveRequest: TeacherTrainingLeaveRequestItem;
};

const pageWidth = 595;
const pageHeight = 842;
const margin = 48;

const toUtf16BeHex = (value: string) => {
  const buffer = Buffer.from(value, "utf16le");
  for (let index = 0; index < buffer.length; index += 2) {
    const first = buffer[index];
    buffer[index] = buffer[index + 1];
    buffer[index + 1] = first;
  }

  return buffer.toString("hex").toUpperCase();
};

const escapePdfLiteral = (value: string) =>
  value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

const isAsciiChar = (char: string) => /^[\u0000-\u00ff]$/.test(char);

const measureRun = (value: string, size: number) => {
  let width = 0;
  for (const char of value) {
    width += isAsciiChar(char) ? size * 0.5 : size;
  }

  return width;
};

const text = (value: string, x: number, y: number, size = 11) => {
  let content = "";
  let current = "";
  let currentIsAscii: boolean | null = null;
  let cursorX = x;
  const flush = () => {
    if (!current) return;
    content += currentIsAscii
      ? `BT /F2 ${size} Tf 1 0 0 1 ${cursorX.toFixed(2)} ${y.toFixed(2)} Tm (${escapePdfLiteral(current)}) Tj ET\n`
      : `BT /F1 ${size} Tf 1 0 0 1 ${cursorX.toFixed(2)} ${y.toFixed(2)} Tm <${toUtf16BeHex(current)}> Tj ET\n`;
    cursorX += measureRun(current, size);
    current = "";
  };

  for (const char of value) {
    const ascii = isAsciiChar(char);
    if (currentIsAscii !== null && ascii !== currentIsAscii) {
      flush();
    }
    currentIsAscii = ascii;
    current += char;
  }
  flush();

  return content;
};

const centeredText = (value: string, y: number, size = 11) =>
  text(value, (pageWidth - measureRun(value, size)) / 2, y, size);

const rightText = (value: string, rightX: number, y: number, size = 11) =>
  text(value, rightX - measureRun(value, size), y, size);

const line = (x1: number, y1: number, x2: number, y2: number) =>
  `${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S\n`;

const rect = (x: number, y: number, width: number, height: number) =>
  `${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re S\n`;

const fillRect = (x: number, y: number, width: number, height: number, gray = 0.92) =>
  `q ${gray.toFixed(2)} g ${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re f Q\n`;

const wrapText = (value: string, maxWidth: number, size = 10) => {
  const lines: string[] = [];
  let current = "";
  for (const char of value.replace(/\r/g, "").split("")) {
    if (char === "\n") {
      lines.push(current);
      current = "";
      continue;
    }
    if (current && measureRun(current + char, size) > maxWidth) {
      lines.push(current);
      current = char;
    } else {
      current += char;
    }
  }
  if (current) {
    lines.push(current);
  }

  return lines.length ? lines : [""];
};

const compactDate = (value: string) => value.replace(/\D/g, "").slice(0, 8);

const toChineseDate = (value: string) => {
  const match = value.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (!match) return value;
  return `${match[1]}年${match[2].padStart(2, "0")}月${match[3].padStart(2, "0")}日`;
};

const toChineseDateRange = (startDate: string, endDate: string) => {
  const start = startDate.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  const end = endDate.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (!start || !end) return `${startDate} 至 ${endDate}`;
  const [, startYear, startMonthRaw, startDayRaw] = start;
  const [, endYear, endMonthRaw, endDayRaw] = end;
  const startMonth = startMonthRaw.padStart(2, "0");
  const startDay = startDayRaw.padStart(2, "0");
  const endMonth = endMonthRaw.padStart(2, "0");
  const endDay = endDayRaw.padStart(2, "0");

  if (startYear === endYear && startMonth === endMonth && startDay === endDay) {
    return `${startYear}年${startMonth}月${startDay}日`;
  }
  if (startYear === endYear && startMonth === endMonth) {
    return `${startYear}年${startMonth}月${startDay}日至${endDay}日`;
  }
  if (startYear === endYear) {
    return `${startYear}年${startMonth}月${startDay}日至${endMonth}月${endDay}日`;
  }
  return `${startYear}年${startMonth}月${startDay}日至${endYear}年${endMonth}月${endDay}日`;
};

const toChineseDateTime = (value: string) => {
  const match = value.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:\s+(\d{1,2}:\d{2}))?/);
  if (!match) return value;
  return `${match[1]}年${match[2].padStart(2, "0")}月${match[3].padStart(2, "0")}日${
    match[4] ? ` ${match[4]}` : ""
  }`;
};

const countInclusiveDays = (startDate: string, endDate: string) => {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) {
    return "";
  }
  return `${Math.round((end - start) / 86_400_000) + 1}天`;
};

const parseDateTimeMs = (date: string, time?: string) => {
  const normalizedTime = time && /^\d{1,2}:\d{2}$/.test(time) ? time : "00:00";
  const value = Date.parse(`${date}T${normalizedTime.padStart(5, "0")}:00`);
  return Number.isNaN(value) ? null : value;
};

const formatLeaveDuration = (leaveRequest: TeacherTrainingLeaveRequestItem) => {
  const startMs = parseDateTimeMs(leaveRequest.startDate, leaveRequest.startTime);
  const endMs = parseDateTimeMs(leaveRequest.endDate, leaveRequest.endTime);
  if (leaveRequest.startTime && leaveRequest.endTime && startMs !== null && endMs !== null && endMs >= startMs) {
    const totalMinutes = Math.max(1, Math.round((endMs - startMs) / 60_000));
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;
    if (days === 0 && hours === 4 && minutes === 0) return "半天";
    if (days === 1 && hours === 0 && minutes === 0) return "1天";
    return [
      days ? `${days}天` : "",
      hours ? `${hours}小时` : "",
      minutes ? `${minutes}分钟` : "",
    ]
      .filter(Boolean)
      .join("");
  }

  return countInclusiveDays(leaveRequest.startDate, leaveRequest.endDate) || "按实际审批";
};

const buildLeaveDocumentNumber = (
  cohortTitle: string,
  leaveRequest: TeacherTrainingLeaveRequestItem,
  leaveSequence = 1,
  cohortStartDate?: string,
) => {
  const year = compactDate(cohortStartDate || leaveRequest.startDate).slice(0, 4) || String(new Date().getFullYear());
  const serial = String(Math.max(1, leaveSequence)).padStart(3, "0");
  const cohortCode = cohortTitle.includes("创新创业") || cohortTitle.includes("竞赛") ? "省培" : "培训";

  return `${cohortCode}请〔${year}〕${serial}号`;
};

const drawCellText = (
  value: string,
  x: number,
  yBottom: number,
  width: number,
  height: number,
  size = 10,
  options: { align?: "left" | "center" | "right"; maxLines?: number } = {},
) => {
  const paddingX = 10;
  const align = options.align ?? "left";
  const contentWidth = width - paddingX * 2;
  const normalizedValue = value || "";
  if (options.maxLines === 1) {
    const fitted = fitTextToWidth(normalizedValue, contentWidth, size, 7);
    const textWidth = measureRun(fitted.value, fitted.size);
    const textX =
      align === "center"
        ? x + (width - textWidth) / 2
        : align === "right"
          ? x + width - paddingX - textWidth
          : x + paddingX;

    return text(fitted.value, textX, yBottom + (height - fitted.size) / 2, fitted.size);
  }

  const lines = wrapText(normalizedValue, contentWidth, size).slice(0, options.maxLines ?? 3);
  const lineHeight = size + 4;
  const blockHeight = lines.length * lineHeight - 4;
  const firstBaseline = yBottom + (height - blockHeight) / 2 + blockHeight - size;
  let content = "";

  lines.forEach((lineText, index) => {
    const textWidth = measureRun(lineText, size);
    const textX =
      align === "center"
        ? x + (width - textWidth) / 2
        : align === "right"
          ? x + width - paddingX - textWidth
          : x + paddingX;
    content += text(lineText, textX, firstBaseline - index * lineHeight, size);
  });

  return content;
};

const fitTextToWidth = (value: string, maxWidth: number, preferredSize = 12, minSize = 8) => {
  let size = preferredSize;
  while (size > minSize && measureRun(value, size) > maxWidth) {
    size -= 0.5;
  }

  return { value, size: Math.max(minSize, size) };
};

const approverLabel = (approval: TeacherTrainingLeaveRequestItem["approvals"][number]) => {
  const title = approval.approverTitle?.trim();
  const name = approval.approverName.trim();
  if (!title || title === name) return name;

  return `${title} ${name}`;
};

const buildContentStream = ({
  cohortTitle,
  cohortStartDate,
  leaveSequence,
  participantName,
  participantTitle,
  organization,
  leaveRequest,
}: LeavePdfInput) => {
  let content = "0 G 0.7 w\n";
  const tableX = margin;
  const tableWidth = pageWidth - margin * 2;
  const labelWidth = 72;
  const valueWidth = (tableWidth - labelWidth * 2) / 2;
  const halfX = tableX + labelWidth + valueWidth;
  const documentNumber = buildLeaveDocumentNumber(cohortTitle, leaveRequest, leaveSequence, cohortStartDate);
  const timeRange =
    leaveRequest.startTime || leaveRequest.endTime
      ? [leaveRequest.startTime || "00:00", leaveRequest.endTime || "24:00"].join("-")
      : "";
  const dateRange = [toChineseDateRange(leaveRequest.startDate, leaveRequest.endDate), timeRange].filter(Boolean).join(" ");
  const leaveDays = formatLeaveDuration(leaveRequest);
  const submittedAt = toChineseDateTime(leaveRequest.submittedAt);
  const completedAt = leaveRequest.completedAt ? toChineseDateTime(leaveRequest.completedAt) : "未完成";

  content += centeredText("江苏省职业院校创新创业教育（竞赛）指导能力提升培训", 792, 13);
  content += centeredText("参训教师请假审批表", 760, 22);
  content += rightText(`编号：${documentNumber}`, pageWidth - margin, 733, 10);
  content += line(margin, 720, pageWidth - margin, 720);

  let yTop = 698;

  const drawFourColumnRow = (
    leftLabel: string,
    leftValue: string,
    rightLabel: string,
    rightValue: string,
    rowHeight = 34,
  ) => {
    const yBottom = yTop - rowHeight;
    content += rect(tableX, yBottom, tableWidth, rowHeight);
    content += line(tableX + labelWidth, yTop, tableX + labelWidth, yBottom);
    content += line(halfX, yTop, halfX, yBottom);
    content += line(halfX + labelWidth, yTop, halfX + labelWidth, yBottom);
    content += drawCellText(leftLabel, tableX, yBottom, labelWidth, rowHeight, 10, { align: "center", maxLines: 1 });
    content += drawCellText(leftValue, tableX + labelWidth, yBottom, valueWidth, rowHeight, 10, { maxLines: 1 });
    content += drawCellText(rightLabel, halfX, yBottom, labelWidth, rowHeight, 10, { align: "center", maxLines: 1 });
    content += drawCellText(rightValue, halfX + labelWidth, yBottom, valueWidth, rowHeight, 10, { maxLines: 1 });
    yTop = yBottom;
  };

  const drawMergedRow = (label: string, value: string, rowHeight = 46, maxLines = 2) => {
    const yBottom = yTop - rowHeight;
    content += rect(tableX, yBottom, tableWidth, rowHeight);
    content += line(tableX + labelWidth, yTop, tableX + labelWidth, yBottom);
    content += drawCellText(label, tableX, yBottom, labelWidth, rowHeight, 10, { align: "center", maxLines: 2 });
    content += drawCellText(value, tableX + labelWidth, yBottom, tableWidth - labelWidth, rowHeight, 10, {
      maxLines,
    });
    yTop = yBottom;
  };

  const drawSignatureRow = () => {
    const rowHeight = 44;
    const yBottom = yTop - rowHeight;
    const valueX = tableX + labelWidth;
    content += rect(tableX, yBottom, tableWidth, rowHeight);
    content += line(valueX, yTop, valueX, yBottom);
    content += drawCellText("申请人签名", tableX, yBottom, labelWidth, rowHeight, 10, { align: "center", maxLines: 2 });
    content += text("申请人电子签名：", valueX + 12, yTop - 18, 10);
    const applicantSignature = fitTextToWidth(participantName, 132, 14, 8);
    content += text(applicantSignature.value, valueX + 92, yTop - 20, applicantSignature.size);
    content += line(valueX + 88, yTop - 25, valueX + 215, yTop - 25);
    content += rightText(`日期：${toChineseDate(leaveRequest.submittedAt)}`, tableX + tableWidth - 12, yTop - 18, 10);
    content += text("本人确认以上请假信息真实，电子签由系统按提交记录自动生成。", valueX + 12, yBottom + 10, 9);
    yTop = yBottom;
  };

  drawFourColumnRow("请假人", participantName, "所在单位", organization || "未填写");
  drawFourColumnRow("职务", participantTitle || "未填写", "请假类别", "培训请假");
  drawMergedRow("培训班次", cohortTitle, 46, 2);
  drawFourColumnRow("请假场次", leaveRequest.sessionLabel || "请假", "请假日期", dateRange, 38);
  drawFourColumnRow("请假天数", leaveDays, "申请状态", leaveRequest.statusLabel, 34);
  drawFourColumnRow("提交时间", submittedAt, "办结时间", completedAt, 34);
  drawMergedRow("请假事由", leaveRequest.reason || "未填写", 82, 4);
  drawSignatureRow();

  const approvalRows = leaveRequest.approvalSteps.map((step) => ({
    step,
    approvals: leaveRequest.approvals.filter((approval) => approval.stepKey === step.key),
  }));
  const approvalSlots = (approvalRows.length ? approvalRows : [{ step: null, approvals: [] }]).slice(0, 4).map(
    ({ step, approvals }) => {
      const rejectedApproval = approvals.find((approval) => approval.decision === "reject");
      const decision = rejectedApproval ? "不同意" : approvals.length ? "同意" : "待审批";
      const meaningfulComments = approvals
        .map((approval) => approval.comment.trim())
        .filter((comment) => comment && comment !== "同意" && comment !== "不同意");

      return {
        requiredCount: step?.requiredCount,
        decision,
        approverNames: approvals.length ? approvals.map(approverLabel) : ["待审批"],
        reviewedAt: approvals.length ? approvals.map((approval) => toChineseDateTime(approval.reviewedAt)).join("、") : "",
        comment: meaningfulComments.join("；"),
      };
    },
  );
  const approvalTop = yTop - 24;
  const approvalHeaderHeight = 30;
  const approvalColumnCount = approvalSlots.length === 1 ? 1 : 2;
  const approvalSlotHeight = 94;
  const approvalSlotWidth = tableWidth / approvalColumnCount;
  const approvalSlotRows = Math.ceil(approvalSlots.length / approvalColumnCount);
  const approvalTableHeight = approvalHeaderHeight + approvalSlotRows * approvalSlotHeight;
  const approvalBottom = approvalTop - approvalTableHeight;

  content += rect(tableX, approvalBottom, tableWidth, approvalTableHeight);
  content += fillRect(tableX, approvalTop - approvalHeaderHeight, tableWidth, approvalHeaderHeight, 0.97);
  content += line(tableX, approvalTop - approvalHeaderHeight, tableX + tableWidth, approvalTop - approvalHeaderHeight);
  content += drawCellText("审批意见", tableX, approvalTop - approvalHeaderHeight, tableWidth, approvalHeaderHeight, 12, {
    align: "center",
    maxLines: 1,
  });

  const drawApprovalBlock = (
    x: number,
    rowTop: number,
    width: number,
    height: number,
    requiredCount: number | undefined,
    decision: string,
    approverNames: string[],
    reviewedAt: string,
    comment: string,
  ) => {
    const rowBottom = rowTop - height;
    content += text(`审批意见：${decision}`, x + 14, rowTop - 20, 10);
    if (comment) {
      wrapText(comment, width - 28, 9)
        .slice(0, 2)
        .forEach((lineText) => {
          content += text(`备注：${lineText}`, x + 14, rowTop - 36, 9);
        });
    }
    if (!comment) {
      content += text("备注：", x + 14, rowTop - 38, 9);
      content += line(x + 42, rowTop - 40, x + width - 14, rowTop - 40);
    }
    wrapText(`审批人电子签：${approverNames.join("、")}`, width - 28, 10)
      .slice(0, 2)
      .forEach((lineText, lineIndex) => {
        content += text(lineText, x + 14, rowBottom + 35 - lineIndex * 13, 10);
      });
    content += text(`审批时间：${reviewedAt}`, x + 14, rowBottom + 11, 9);
    if (requiredCount && approverNames.length > 1) {
      content += rightText(`需 ${requiredCount} 人同意`, x + width - 14, rowBottom + 11, 8);
    }
  };

  for (let rowIndex = 0; rowIndex < approvalSlotRows; rowIndex += 1) {
    const rowTop = approvalTop - approvalHeaderHeight - rowIndex * approvalSlotHeight;
    const rowBottom = rowTop - approvalSlotHeight;
    if (rowIndex > 0) {
      content += line(tableX, rowTop, tableX + tableWidth, rowTop);
    }
    for (let columnIndex = 1; columnIndex < approvalColumnCount; columnIndex += 1) {
      const columnX = tableX + columnIndex * approvalSlotWidth;
      content += line(columnX, rowTop, columnX, rowBottom);
    }
  }

  approvalSlots.forEach((slot, index) => {
    const rowIndex = Math.floor(index / approvalColumnCount);
    const columnIndex = index % approvalColumnCount;
    const x = tableX + columnIndex * approvalSlotWidth;
    const rowTop = approvalTop - approvalHeaderHeight - rowIndex * approvalSlotHeight;
    drawApprovalBlock(
      x,
      rowTop,
      approvalSlotWidth,
      approvalSlotHeight,
      slot.requiredCount,
      slot.decision,
      slot.approverNames,
      slot.reviewedAt,
      slot.comment,
    );
  });

  content += text(
    "注：本表编号由系统自动生成；申请人和审批人姓名由系统按记录自动生成电子签。",
    margin,
    approvalBottom - 22,
    8.5,
  );

  return content;
};

export const buildTeacherTrainingLeaveRequestPdf = (input: LeavePdfInput) => {
  const content = buildContentStream(input);
  const contentBuffer = Buffer.from(content, "utf8");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 4 0 R /F2 7 0 R >> >> /Contents 8 0 R >>`,
    "<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /UniGB-UCS2-H /DescendantFonts [5 0 R] >>",
    "<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 2 >> /FontDescriptor 6 0 R >>",
    "<< /Type /FontDescriptor /FontName /STSong-Light /Flags 6 /FontBBox [0 -200 1000 900] /ItalicAngle 0 /Ascent 880 /Descent -120 /CapHeight 880 /StemV 80 >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >>",
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
