import { NextRequest, NextResponse } from "next/server";
import mammoth from "mammoth";

import { getSessionUser } from "@/lib/auth";
import { getTeacherTrainingAccessFlags } from "@/lib/teacher-training-access";

export const runtime = "nodejs";

const importMaxBytes = 8 * 1024 * 1024;

class PdfJsNodeDOMMatrix {
  a = 1;
  b = 0;
  c = 0;
  d = 1;
  e = 0;
  f = 0;
  is2D = true;
  isIdentity = true;

  constructor(init?: number[] | PdfJsNodeDOMMatrix) {
    if (Array.isArray(init) && init.length >= 6) {
      [this.a, this.b, this.c, this.d, this.e, this.f] = init;
      this.isIdentity = this.a === 1 && this.b === 0 && this.c === 0 && this.d === 1 && this.e === 0 && this.f === 0;
    } else if (init instanceof PdfJsNodeDOMMatrix) {
      this.a = init.a;
      this.b = init.b;
      this.c = init.c;
      this.d = init.d;
      this.e = init.e;
      this.f = init.f;
      this.isIdentity = init.isIdentity;
    }
  }

  multiplySelf() {
    return this;
  }

  preMultiplySelf() {
    return this;
  }

  translateSelf(x = 0, y = 0) {
    this.e += x;
    this.f += y;
    this.isIdentity = false;
    return this;
  }

  scaleSelf(scaleX = 1, scaleY = scaleX) {
    this.a *= scaleX;
    this.d *= scaleY;
    this.isIdentity = false;
    return this;
  }

  rotateSelf() {
    return this;
  }

  invertSelf() {
    return this;
  }

  transformPoint(point: { x?: number; y?: number; z?: number; w?: number } = {}) {
    return {
      x: point.x ?? 0,
      y: point.y ?? 0,
      z: point.z ?? 0,
      w: point.w ?? 1,
    };
  }
}

class PdfJsNodeImageData {
  constructor(
    public data: Uint8ClampedArray,
    public width: number,
    public height: number,
  ) {}
}

class PdfJsNodePath2D {}

const ensurePdfJsNodePolyfills = async () => {
  const globalWithPdfPolyfills = globalThis as unknown as Record<string, unknown>;

  globalWithPdfPolyfills.DOMMatrix ??= PdfJsNodeDOMMatrix;
  globalWithPdfPolyfills.ImageData ??= PdfJsNodeImageData;
  globalWithPdfPolyfills.Path2D ??= PdfJsNodePath2D;
  globalWithPdfPolyfills.pdfjsWorker ??= await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
};

const getFileExtension = (fileName: string) => {
  const normalized = fileName.toLowerCase();
  const dotIndex = normalized.lastIndexOf(".");
  return dotIndex >= 0 ? normalized.slice(dotIndex) : "";
};

const decodeXml = (value: string) =>
  value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

const getXmlAttribute = (tag: string, name: string) => {
  const match = tag.match(new RegExp(`${name}="([^"]*)"`));
  return match ? decodeXml(match[1]) : "";
};

const getCellColumnIndex = (cellRef: string) => {
  const letters = cellRef.match(/^[A-Z]+/i)?.[0].toUpperCase() ?? "";
  let index = 0;
  for (const letter of letters) {
    index = index * 26 + letter.charCodeAt(0) - 64;
  }
  return Math.max(0, index - 1);
};

const extractTextNodes = (xml: string) =>
  [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)]
    .map((match) => decodeXml(match[1]))
    .join("");

const parseTeacherTrainingWorkbookRows = async (buffer: Buffer) => {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buffer);
  const sharedStringsXml = await zip.file("xl/sharedStrings.xml")?.async("string");
  const sharedStrings = sharedStringsXml
    ? [...sharedStringsXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) => extractTextNodes(match[1]))
    : [];

  const workbookXml = await zip.file("xl/workbook.xml")?.async("string");
  const relationshipXml = await zip.file("xl/_rels/workbook.xml.rels")?.async("string");
  if (!workbookXml || !relationshipXml) {
    throw new Error("Excel 文件结构不完整，无法识别工作表");
  }

  const firstSheetTag = workbookXml.match(/<sheet\b[^>]*>/)?.[0];
  const firstSheetRelId = firstSheetTag ? getXmlAttribute(firstSheetTag, "r:id") : "";
  const relationshipTag = firstSheetRelId
    ? relationshipXml.match(new RegExp(`<Relationship\\b[^>]*Id="${firstSheetRelId}"[^>]*>`))?.[0]
    : "";
  const sheetTarget = relationshipTag ? getXmlAttribute(relationshipTag, "Target") : "worksheets/sheet1.xml";
  const sheetPath = sheetTarget.startsWith("/") ? sheetTarget.slice(1) : `xl/${sheetTarget.replace(/^xl\//, "")}`;
  const sheetXml = await zip.file(sheetPath)?.async("string");
  if (!sheetXml) {
    throw new Error("Excel 文件中没有可识别的工作表");
  }

  return [...sheetXml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)]
    .map((rowMatch) => {
      const cells: string[] = [];
      for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
        const attrs = cellMatch[1];
        const body = cellMatch[2];
        const columnIndex = getCellColumnIndex(getXmlAttribute(attrs, "r"));
        const type = getXmlAttribute(attrs, "t");
        const rawValue = body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "";
        const inlineValue = extractTextNodes(body);
        cells[columnIndex] = type === "s" ? (sharedStrings[Number(rawValue)] ?? "") : inlineValue || decodeXml(rawValue);
      }
      return cells.map((cell) => cell?.trim() ?? "");
    })
    .filter((row) => row.some(Boolean));
};

const extractPdfText = async (buffer: Buffer) => {
  await ensurePdfJsNodePolyfills();
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
  });
  const document = await loadingTask.promise;
  const pageTexts: string[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pageTexts.push(
        content.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" ")
          .replace(/\s+/g, " ")
          .trim(),
      );
    }
  } finally {
    await document.destroy().catch(() => undefined);
  }

  return pageTexts.join("\n");
};

const normalizeLines = (text: string) =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

const toPreviewText = (rows: string[][]) => rows.map((row) => row.map((cell) => cell.trim()).join("\t")).join("\n");

const extractCourseRowsFromText = (text: string) => {
  const lines = normalizeLines(text);
  const tableRows = lines
    .map((line) => line.split(/\t|,|，/).map((cell) => cell.trim()))
    .filter((row) => row.length >= 3 && row.some(Boolean));
  if (tableRows.length > 0) {
    return tableRows;
  }

  return lines
    .map((line) => {
      const date = line.match(/\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}日?/)?.[0] ?? "";
      const times = [...line.matchAll(/\d{1,2}:\d{2}/g)].map((match) => match[0]);
      const cleanedTitle = line
        .replace(date, "")
        .replace(/\d{1,2}:\d{2}\s*[-至到~]\s*\d{1,2}:\d{2}/g, "")
        .replace(/\s+/g, " ")
        .trim();
      return [cleanedTitle, date, times[0] ?? "", times[1] ?? "", "", "", line];
    })
    .filter((row) => row[0] && (row[1] || row[2]));
};

const extractImportPreview = async (file: File, kind: string) => {
  const extension = getFileExtension(file.name);
  const buffer = Buffer.from(await file.arrayBuffer());

  if ([".xlsx"].includes(extension)) {
    const rows = await parseTeacherTrainingWorkbookRows(buffer);
    return toPreviewText(rows);
  }

  if ([".csv", ".tsv", ".txt"].includes(extension)) {
    return buffer.toString("utf8");
  }

  if (kind === "courses" && extension === ".docx") {
    const result = await mammoth.extractRawText({ buffer });
    return toPreviewText(extractCourseRowsFromText(result.value));
  }

  if (kind === "courses" && extension === ".pdf") {
    return toPreviewText(extractCourseRowsFromText(await extractPdfText(buffer)));
  }

  if (extension === ".xls") {
    throw new Error("旧版 .xls 暂不支持自动识别，请另存为 .xlsx 后上传");
  }

  if (extension === ".doc") {
    throw new Error("旧版 .doc 暂不支持自动识别，请另存为 .docx 后上传");
  }

  throw new Error(kind === "courses" ? "课程导入支持 Word(.docx)、PDF、Excel(.xlsx)、CSV、TSV、TXT" : "参训教师导入支持 Excel(.xlsx)、CSV、TSV、TXT");
};

export async function POST(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const access = await getTeacherTrainingAccessFlags(user);
  if (!access.hasTeacherTrainingManagerAccess) {
    return NextResponse.json({ message: "无权限导入省培文件" }, { status: 403 });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  const kind = `${formData?.get("kind") ?? ""}`.trim();

  if (kind !== "participants" && kind !== "courses") {
    return NextResponse.json({ message: "请选择导入类型" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ message: "请上传导入文件" }, { status: 400 });
  }
  if (file.size > importMaxBytes) {
    return NextResponse.json({ message: "导入文件最大 8MB，请拆分后再上传" }, { status: 400 });
  }

  try {
    const text = await extractImportPreview(file, kind);
    if (!text.trim()) {
      return NextResponse.json({ message: "没有识别到可导入内容，请检查文件内容" }, { status: 400 });
    }

    return NextResponse.json({ fileName: file.name, text });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "省培文件识别失败" },
      { status: 400 },
    );
  }
}
