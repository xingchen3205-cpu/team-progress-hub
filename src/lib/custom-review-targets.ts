const listMarkerPattern = /^\s*(?:\d{1,3}[.、)\-]|[（(]\d{1,3}[）)]|[-*•])\s*/;
const projectNameSeparatorPattern = /--|——|—|－|:|：/;
const terminalPunctuationPattern = /[。！？!?；;]$/;

const getTextLength = (value: string) => Array.from(value).length;

const normalizeProjectNameLine = (value: string) =>
  value.replace(listMarkerPattern, "").replace(/\s+/g, " ").trim();

const shouldMergeWrappedProjectNameLine = (previous: string | undefined, current: string, rawCurrent: string) => {
  if (!previous || !current) return false;
  if (listMarkerPattern.test(rawCurrent)) return false;
  if (projectNameSeparatorPattern.test(current)) return false;
  if (terminalPunctuationPattern.test(previous)) return false;

  return getTextLength(previous) >= 26 && getTextLength(current) <= 3;
};

export const parseCustomReviewTargetNames = (source: string | string[]) => {
  const lines = (Array.isArray(source) ? source.join("\n") : source)
    .split(/\r?\n/)
    .map((line) => ({ raw: line, normalized: normalizeProjectNameLine(line) }))
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
