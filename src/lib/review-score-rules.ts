export type ReviewScoreRuleInput = {
  expertCount: number;
  dropHighestCount: number;
  dropLowestCount: number;
};

export const normalizeReviewScoreRuleCount = (value: unknown, fallback = 1) => {
  const numericValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return Math.min(5, Math.max(0, Math.trunc(numericValue)));
};

export const getRemainingReviewScoreCount = ({
  expertCount,
  dropHighestCount,
  dropLowestCount,
}: ReviewScoreRuleInput) =>
  Math.max(0, expertCount - Math.max(0, dropHighestCount) - Math.max(0, dropLowestCount));

export const validateReviewScoreRule = ({
  expertCount,
  dropHighestCount,
  dropLowestCount,
}: ReviewScoreRuleInput) => {
  const remainingCount = getRemainingReviewScoreCount({
    expertCount,
    dropHighestCount,
    dropLowestCount,
  });

  if (remainingCount < 2) {
    return `当前有效专家 ${expertCount} 位，去掉后剩余 ${remainingCount} 个有效评分；至少保留 2 个有效评分`;
  }

  return null;
};
