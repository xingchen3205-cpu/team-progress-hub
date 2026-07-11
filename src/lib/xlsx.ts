import { createZipArchive } from "@/lib/zip";

export type XlsxCell = {
  value: string | number | null | undefined;
  // "text" 强制按文本导出，避免手机号、账号被 Excel 解析成科学计数法。
  type?: "text" | "number";
};

export type SimpleXlsxOptions = {
  sheetName?: string;
  headers: string[];
  rows: XlsxCell[][];
  columnWidths?: number[];
  freezeHeader?: boolean;
};

const escapeXml = (value: unknown) =>
  `${value ?? ""}`
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export const xlsxColumnLetter = (index: number) => {
  let current = index;
  let letters = "";
  do {
    letters = String.fromCharCode(65 + (current % 26)) + letters;
    current = Math.floor(current / 26) - 1;
  } while (current >= 0);
  return letters;
};

const sanitizeSheetName = (value?: string) => {
  const cleaned = (value ?? "Sheet1").replace(/[\\/?*[\]:]/g, " ").trim() || "Sheet1";
  return cleaned.slice(0, 31);
};

const renderCell = (columnIndex: number, rowNumber: number, cell: XlsxCell, headerRow = false) => {
  const ref = `${xlsxColumnLetter(columnIndex)}${rowNumber}`;
  const styleAttr = headerRow ? ' s="1"' : "";
  if (!headerRow && cell.type === "number" && typeof cell.value === "number" && Number.isFinite(cell.value)) {
    return `<c r="${ref}"${styleAttr}><v>${cell.value}</v></c>`;
  }
  const text = escapeXml(cell.value);
  return `<c r="${ref}"${styleAttr} t="inlineStr"><is><t xml:space="preserve">${text}</t></is></c>`;
};

const renderRow = (rowNumber: number, cells: XlsxCell[], headerRow = false) =>
  `<row r="${rowNumber}">${cells.map((cell, index) => renderCell(index, rowNumber, cell, headerRow)).join("")}</row>`;

export const buildSimpleXlsxSheetXml = ({
  headers,
  rows,
  columnWidths,
  freezeHeader = true,
}: SimpleXlsxOptions) => {
  const columnCount = Math.max(headers.length, ...rows.map((row) => row.length), 1);
  const colsXml = columnWidths?.length
    ? `<cols>${columnWidths
        .map(
          (width, index) =>
            `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`,
        )
        .join("")}</cols>`
    : "";
  const headerCells: XlsxCell[] = headers.map((header) => ({ value: header, type: "text" }));
  const bodyRows = rows.map((row, index) => renderRow(index + 2, row)).join("");
  const sheetView = freezeHeader
    ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>`
    : `<sheetViews><sheetView workbookViewId="0"/></sheetViews>`;
  const dimension = `A1:${xlsxColumnLetter(columnCount - 1)}${rows.length + 1}`;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="${dimension}"/>${sheetView}${colsXml}<sheetData>${renderRow(1, headerCells, true)}${bodyRows}</sheetData></worksheet>`;
};

const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Microsoft YaHei"/></font><font><b/><sz val="11"/><name val="Microsoft YaHei"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

export const buildSimpleXlsx = (options: SimpleXlsxOptions) => {
  const sheetName = sanitizeSheetName(options.sheetName);
  const sheetXml = buildSimpleXlsxSheetXml(options);

  return createZipArchive([
    {
      path: "[Content_Types].xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    },
    {
      path: "_rels/.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      path: "xl/workbook.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    },
    {
      path: "xl/_rels/workbook.xml.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    },
    {
      path: "xl/worksheets/sheet1.xml",
      content: sheetXml,
    },
    {
      path: "xl/styles.xml",
      content: stylesXml,
    },
  ]);
};
