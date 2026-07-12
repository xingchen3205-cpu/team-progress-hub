// 省培 Excel(.xlsx) 解析工具：复用现有 JSZip 依赖读取工作表行，供参训导入、课程导入、
// 以及签到名单导入等共用，避免重复引入重量级依赖。

export const getFileExtension = (fileName: string) => {
  const normalized = fileName.toLowerCase();
  const dotIndex = normalized.lastIndexOf(".");
  return dotIndex >= 0 ? normalized.slice(dotIndex) : "";
};

export const decodeWorkbookXml = (value: string) =>
  value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

export const getWorkbookXmlAttribute = (tag: string, name: string) => {
  const match = tag.match(new RegExp(`${name}="([^"]*)"`));
  return match ? decodeWorkbookXml(match[1]) : "";
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
    .map((match) => decodeWorkbookXml(match[1]))
    .join("");

export const parseTeacherTrainingWorkbookRows = async (buffer: Buffer): Promise<string[][]> => {
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
  const firstSheetRelId = firstSheetTag ? getWorkbookXmlAttribute(firstSheetTag, "r:id") : "";
  const relationshipTag = firstSheetRelId
    ? relationshipXml.match(new RegExp(`<Relationship\\b[^>]*Id="${firstSheetRelId}"[^>]*>`))?.[0]
    : "";
  const sheetTarget = relationshipTag ? getWorkbookXmlAttribute(relationshipTag, "Target") : "worksheets/sheet1.xml";
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
        const columnIndex = getCellColumnIndex(getWorkbookXmlAttribute(attrs, "r"));
        const type = getWorkbookXmlAttribute(attrs, "t");
        const rawValue = body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "";
        const inlineValue = extractTextNodes(body);
        cells[columnIndex] = type === "s" ? (sharedStrings[Number(rawValue)] ?? "") : inlineValue || decodeWorkbookXml(rawValue);
      }
      return cells.map((cell) => cell?.trim() ?? "");
    })
    .filter((row) => row.some(Boolean));
};
