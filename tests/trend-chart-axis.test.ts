import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import path from "node:path";

const scheduleSource = readFileSync(
  path.join(process.cwd(), "src/components/tabs/schedule-tab.tsx"),
  "utf8",
);

const trendSource = readFileSync(
  path.join(process.cwd(), "src/components/trend-analysis.tsx"),
  "utf8",
);

describe("trend chart axis and today handling", () => {
  it("has a tick sampling helper to limit axis label density", () => {
    assert.match(scheduleSource, /getTrendAxisTickIndexes/);
    assert.match(trendSource, /getTrendAxisTickIndexes/);
  });

  it("does not render all date labels on the SVG x-axis", () => {
    // The SVG chart should use tick indexes, not render every point's label
    assert.match(scheduleSource, /tickIndexes/);
    assert.match(scheduleSource, /remainingSlots/);
    assert.doesNotMatch(scheduleSource, /Math\.ceil\(total\s*\/\s*maxTicks\)/);
  });

  it("does not draw a line through null (un-statistical) points", () => {
    // linePath must not connect through null values using fallback 0
    assert.doesNotMatch(scheduleSource, /fallbackValue.*lastKnownValue/);
    assert.match(scheduleSource, /lineSegments/);
  });

  it("uses segmented line paths for discontinuous data", () => {
    // When a point has null rate, the path should break, not fall to 0
    assert.match(scheduleSource, /M\s/);
    assert.match(scheduleSource, /typeof\s+point\.value\s*===\s*["']number["']/);
    assert.match(scheduleSource, /areaSegments/);
  });

  it("labels today distinctly without overlapping date text", () => {
    // Today label should not share the same y position as regular date labels
    assert.doesNotMatch(scheduleSource, /y="165".*今日/);
  });

  it("shows '今日待统计' instead of 0% when today is before deadline", () => {
    assert.match(scheduleSource, /今日待统计/);
  });

  it("limits Recharts XAxis ticks instead of showing every point", () => {
    assert.match(trendSource, /ticks=\{/);
    assert.match(trendSource, /tickIndexes/);
    assert.match(trendSource, /remainingSlots/);
    assert.doesNotMatch(trendSource, /Math\.ceil\(total\s*\/\s*maxTicks\)/);
  });

  it("does not convert null submitRate to 0 in Recharts data", () => {
    assert.doesNotMatch(trendSource, /rate:\s*point\.submitRate\s*\|\|\s*0/);
  });

  it("has enough bottom padding for axis labels", () => {
    // chartHeight or viewBox should be taller than 180 to accommodate labels
    const chartHeightMatch = scheduleSource.match(/chartHeight\s*=\s*(\d+)/);
    const height = chartHeightMatch ? Number(chartHeightMatch[1]) : 0;
    assert.ok(height >= 200, `expected chartHeight >= 200, got ${height}`);
  });
});
