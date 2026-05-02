"use client";

import type { ReactNode } from "react";
import { MessageSquareText, ThumbsUp, TrendingDown, TrendingUp } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type TrendAnalysisRange = "week" | "month";

export type TrendAnalysisPoint = {
  date: string;
  label: string;
  submitRate: number | null;
  praiseCount: number;
  evaluationCount: number;
};

export type TrendAnalysisStats = {
  averageSubmitRate: number;
  submitRateDelta: number;
  totalEvaluationCount: number;
  totalPraiseCount: number;
};

type TrendAnalysisProps = {
  range: TrendAnalysisRange;
  onRangeChange: (range: TrendAnalysisRange) => void;
  series: TrendAnalysisPoint[];
  stats: TrendAnalysisStats;
  todayDateKey: string;
};

type ChartDataPoint = {
  date: string;
  rate: number | null;
  rawLabel: string;
};

type ChartDotProps = {
  cx?: number;
  cy?: number;
  payload?: ChartDataPoint;
  index?: number;
  totalLength: number;
};

type ChartTooltipProps = {
  active?: boolean;
  label?: string;
  payload?: Array<{
    value?: number | null;
  }>;
};

const getTrendAxisTickIndexes = (total: number, todayIndex: number) => {
  if (total <= 0) {
    return [];
  }

  const maxTicks = 7;
  if (total <= maxTicks) {
    return Array.from({ length: total }, (_, i) => i);
  }

  const safeTodayIndex = todayIndex >= 0 && todayIndex < total ? todayIndex : total - 1;
  const indexes = new Set<number>([0, safeTodayIndex, total - 1]);
  const candidateIndexes = Array.from({ length: total - 2 }, (_, i) => i + 1).filter(
    (index) => !indexes.has(index),
  );
  const remainingSlots = Math.max(0, maxTicks - indexes.size);

  for (let slot = 1; slot <= remainingSlots && candidateIndexes.length > 0; slot += 1) {
    const candidateOffset = Math.round((slot * (candidateIndexes.length + 1)) / (remainingSlots + 1)) - 1;
    const safeOffset = Math.min(candidateIndexes.length - 1, Math.max(0, candidateOffset));
    indexes.add(candidateIndexes[safeOffset]);
  }

  return Array.from(indexes).sort((a, b) => a - b);
};

const getEffectiveDays = (series: TrendAnalysisPoint[]) =>
  series.filter((point) => typeof point.submitRate === "number").length;

const hasSubmitRateVariance = (series: TrendAnalysisPoint[]) => {
  const values = series
    .map((point) => point.submitRate)
    .filter((value): value is number => typeof value === "number");

  return values.length > 1 && values.some((value) => value !== values[0]);
};

function ChartTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload?.length) {
    return null;
  }

  const value = payload[0]?.value;

  return (
    <div className="rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-lg">
      <p className="mb-1 text-xs text-gray-400">{label}</p>
      <p className="text-lg font-medium text-gray-800">
        {typeof value === "number" ? `${value}%` : "数据待更新"}
      </p>
    </div>
  );
}

// 低于70%的点需要明确提示，避免管理员错过提交率风险。
function ChartDot({ cx, cy, payload, index = 0, totalLength }: ChartDotProps) {
  if (typeof cx !== "number" || typeof cy !== "number") {
    return null;
  }

  const rate = payload?.rate;
  const isLast = index === totalLength - 1;
  const isLow = typeof rate === "number" && rate < 70;
  const color = isLow ? "#ef4444" : "#3b82f6";

  return (
    <g>
      {isLow ? <circle cx={cx} cy={cy} fill="#fee2e2" opacity={0.5} r={10} /> : null}
      {isLast ? <circle cx={cx} cy={cy} fill="#3b82f6" opacity={0.1} r={10} /> : null}
      <circle
        cx={cx}
        cy={cy}
        fill={color}
        r={isLast ? 5 : 4}
        stroke="white"
        strokeWidth={2.5}
      />
    </g>
  );
}

const TrendStatCard = ({
  children,
  icon,
  label,
  value,
}: {
  children?: ReactNode;
  icon: ReactNode;
  label: string;
  value: ReactNode;
}) => (
  <div className="rounded-2xl bg-gray-50 p-4 transition-transform hover:-translate-y-0.5">
    <div className="mb-3 flex items-center justify-between">
      {icon}
      {children}
    </div>
    <p className="mb-1 text-xs text-gray-400">{label}</p>
    <p className="text-3xl font-bold tracking-tight text-gray-800">{value}</p>
  </div>
);

export default function TrendAnalysis({
  range,
  onRangeChange,
  series,
  stats,
  todayDateKey,
}: TrendAnalysisProps) {
  const periodCopy =
    range === "week"
      ? {
          averageLabel: "本周平均提交率",
          commentsLabel: "本周总点评数",
          flatState: "本周暂无点评活动",
          likesLabel: "本周总点赞数",
        }
      : {
          averageLabel: "本月平均提交率",
          commentsLabel: "本月总点评数",
          flatState: "本月暂无点评活动",
          likesLabel: "本月总点赞数",
        };
  const chartData: ChartDataPoint[] = series.map((point, index) => ({
    date: point.date === todayDateKey || index === series.length - 1 ? "今日" : point.label,
    rate: point.submitRate,
    rawLabel: point.label,
  }));
  const effectiveDays = getEffectiveDays(series);
  const shouldShowAccumulating = effectiveDays < 3;
  const shouldShowFlatState = !shouldShowAccumulating && !hasSubmitRateVariance(series);
  const tickIndexes = getTrendAxisTickIndexes(chartData.length, chartData.length - 1);

  return (
    <section className="w-full">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h3 className="text-xl font-bold text-gray-800">趋势分析</h3>
          <p className="mt-1 text-sm text-gray-400">
            按加权值看提交率、点评总数和点赞数量变化
          </p>
        </div>
        <div className="flex rounded-xl bg-gray-100 p-1">
          {(["week", "month"] as const).map((item) => (
            <button
              className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-all ${
                range === item
                  ? "bg-white text-gray-800 shadow-sm"
                  : "text-gray-400 hover:text-gray-600"
              }`}
              key={item}
              onClick={() => onRangeChange(item)}
              type="button"
            >
              {item === "week" ? "本周" : "本月"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-4 xl:flex-row">
        <div className="flex shrink-0 flex-col gap-3 xl:w-[220px]">
          <TrendStatCard
            icon={(
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50">
                <TrendingUp className="h-[18px] w-[18px] text-blue-500" />
              </span>
            )}
            label={periodCopy.averageLabel}
            value={(
              <>
                {stats.averageSubmitRate}
                <span className="ml-0.5 text-base font-normal text-gray-400">%</span>
              </>
            )}
          >
            <span
              className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                stats.submitRateDelta < 0
                  ? "bg-red-50 text-red-500"
                  : "bg-emerald-50 text-emerald-600"
              }`}
            >
              {stats.submitRateDelta < 0 ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
              {Math.abs(stats.submitRateDelta)}%
            </span>
          </TrendStatCard>

          <TrendStatCard
            icon={(
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-50">
                <MessageSquareText className="h-[18px] w-[18px] text-purple-500" />
              </span>
            )}
            label={periodCopy.commentsLabel}
            value={stats.totalEvaluationCount}
          />

          <TrendStatCard
            icon={(
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50">
                <ThumbsUp className="h-[18px] w-[18px] text-amber-500" />
              </span>
            )}
            label={periodCopy.likesLabel}
            value={stats.totalPraiseCount}
          />
        </div>

        <div className="min-h-[348px] flex-1 rounded-2xl border border-gray-100 bg-white p-6">
          {shouldShowAccumulating ? (
            <div className="flex h-[300px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 text-center">
              <TrendingUp className="mb-2 h-8 w-8 text-slate-300" />
              <p className="text-sm font-medium text-slate-500">数据积累中，3 天后显示趋势</p>
              <p className="mt-1 text-xs text-slate-400">当前已积累 {effectiveDays} 天数据</p>
            </div>
          ) : shouldShowFlatState && stats.totalEvaluationCount === 0 ? (
            <div className="flex h-[300px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 text-center">
              <MessageSquareText className="mb-2 h-8 w-8 text-slate-300" />
              <p className="text-sm font-medium text-slate-500">{periodCopy.flatState}</p>
              <p className="mt-1 text-xs text-slate-400">提交率波动较少，建议结合成员明细继续观察。</p>
            </div>
          ) : (
            <ResponsiveContainer height={300} width="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="rateGradient" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.12} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  axisLine={false}
                  dataKey="date"
                  dy={10}
                  tick={{ fontSize: 12, fill: "#94a3b8" }}
                  tickLine={false}
                  ticks={tickIndexes.map((i) => chartData[i]?.date).filter(Boolean)}
                />
                <YAxis
                  axisLine={false}
                  domain={[0, 100]}
                  tick={{ fontSize: 12, fill: "#94a3b8" }}
                  tickFormatter={(value: number) => `${value}%`}
                  tickLine={false}
                  ticks={[0, 25, 50, 75, 100]}
                />
                <Tooltip content={<ChartTooltip />} />
                <ReferenceLine
                  label={{
                    value: "警戒线 70%",
                    position: "insideTopRight",
                    fill: "#d97706",
                    fontSize: 11,
                  }}
                  stroke="#fbbf24"
                  strokeDasharray="6 4"
                  strokeWidth={1}
                  y={70}
                />
                <Area
                  activeDot={{
                    r: 6,
                    fill: "#3b82f6",
                    stroke: "white",
                    strokeWidth: 3,
                  }}
                  animationDuration={600}
                  dataKey="rate"
                  dot={(props) => (
                    <ChartDot
                      {...(props as unknown as ChartDotProps)}
                      totalLength={chartData.length}
                    />
                  )}
                  fill="url(#rateGradient)"
                  stroke="#3b82f6"
                  strokeWidth={2.5}
                  type="monotone"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </section>
  );
}
