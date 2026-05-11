const listMarkerPattern = /^\s*(?:\d{1,3}[.、)\-]|[（(]\d{1,3}[）)]|[-*•])\s*/;
const projectNameSeparatorPattern = /--|——|—|－|:|：/;
const terminalPunctuationPattern = /[。！？!?；;]$/;
const spreadsheetHeaderPattern = /^(序号|编号|项目名称|项目名|项目|名称|负责人|团队|团队名称|组别|备注)$/;
const numericCellPattern = /^\d{1,4}$/;

const getTextLength = (value: string) => Array.from(value).length;

const normalizeProjectNameLine = (value: string) =>
  value.replace(listMarkerPattern, "").replace(/\s+/g, " ").trim();

const splitDelimitedLine = (line: string, delimiter: "," | "\t") => {
  if (delimiter === "\t") return line.split("\t");

  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (const char of line) {
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === delimiter && !quoted) {
      cells.push(current);
      current = "";
      continue;
    }
    current += char;
  }

  cells.push(current);
  return cells;
};

const getLikelyProjectNameFromRow = (rawLine: string) => {
  const delimiter = rawLine.includes("\t") ? "\t" : rawLine.includes(",") ? "," : null;
  if (!delimiter) return normalizeProjectNameLine(rawLine);

  const candidates = splitDelimitedLine(rawLine, delimiter)
    .map((cell) => normalizeProjectNameLine(cell))
    .filter((cell) => Boolean(cell))
    .filter((cell) => !spreadsheetHeaderPattern.test(cell))
    .filter((cell) => !numericCellPattern.test(cell));

  if (candidates.length === 0) return "";
  return candidates.reduce((best, current) => (getTextLength(current) > getTextLength(best) ? current : best));
};

const getSpreadsheetProjectNameColumnIndex = (rows: string[][]) => {
  for (const row of rows.slice(0, 8)) {
    const index = row.findIndex((cell) => /^(项目名称|项目名)$/.test(normalizeProjectNameLine(cell)));
    if (index >= 0) return index;
  }
  return -1;
};

const parseSpreadsheetProjectNameRows = (source: string) => {
  const rawLines = source.split(/\r?\n/).filter((line) => Boolean(line.trim()));
  const delimiter = rawLines.some((line) => line.includes("\t")) ? "\t" : rawLines.some((line) => line.includes(",")) ? "," : null;
  if (!delimiter) return null;

  const rows = rawLines.map((line) => splitDelimitedLine(line, delimiter));
  const projectNameColumnIndex = getSpreadsheetProjectNameColumnIndex(rows);
  if (projectNameColumnIndex < 0) return null;

  return rows
    .map((row) => normalizeProjectNameLine(row[projectNameColumnIndex] ?? ""))
    .filter((cell) => Boolean(cell))
    .filter((cell) => !spreadsheetHeaderPattern.test(cell));
};

const shouldMergeWrappedProjectNameLine = (previous: string | undefined, current: string, rawCurrent: string) => {
  if (!previous || !current) return false;
  if (listMarkerPattern.test(rawCurrent)) return false;
  if (projectNameSeparatorPattern.test(current)) return false;
  if (terminalPunctuationPattern.test(previous)) return false;

  return getTextLength(previous) >= 26 && getTextLength(current) <= 3;
};

export const parseCustomReviewTargetNames = (source: string | string[]) => {
  const rawSource = Array.isArray(source) ? source.join("\n") : source;
  const spreadsheetProjectNames = parseSpreadsheetProjectNameRows(rawSource);
  const normalizedSource = spreadsheetProjectNames ? spreadsheetProjectNames.join("\n") : rawSource;

  const lines = normalizedSource
    .split(/\r?\n/)
    .map((line) => ({ raw: line, normalized: getLikelyProjectNameFromRow(line) }))
    .filter((line) => Boolean(line.normalized));

  const merged: string[] = [];

  for (const line of lines) {
    const previous = merged[merged.length - 1];
    if (shouldMergeWrappedProjectNameLine(previous, line.normalized, line.raw)) {
      merged[merged.length - 1] = `${previous}${line.normalized}`;
      continue;
    }
    merged.push(line.normalized);
  }

  return [...new Set(merged)];
};
