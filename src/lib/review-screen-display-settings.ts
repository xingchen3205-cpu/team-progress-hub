export type ReviewScreenDisplaySettings = {
  scoringEnabled: boolean;
  showScoresOnScreen: boolean;
  showFinalScoreOnScreen: boolean;
  showRankingOnScreen: boolean;
  selfDrawEnabled: boolean;
};

export const defaultReviewScreenDisplaySettings: ReviewScreenDisplaySettings = {
  scoringEnabled: true,
  showScoresOnScreen: false,
  showFinalScoreOnScreen: false,
  showRankingOnScreen: false,
  selfDrawEnabled: false,
};

const normalizeBoolean = (value: unknown, fallback: boolean) =>
  typeof value === "boolean" ? value : fallback;

export const normalizeReviewScreenDisplaySettings = (
  value?: Partial<Record<keyof ReviewScreenDisplaySettings, unknown>> | null,
  fallback: ReviewScreenDisplaySettings = defaultReviewScreenDisplaySettings,
): ReviewScreenDisplaySettings => {
  const scoringEnabled = normalizeBoolean(value?.scoringEnabled, fallback.scoringEnabled);

  return {
    scoringEnabled,
    showScoresOnScreen: scoringEnabled
      ? normalizeBoolean(value?.showScoresOnScreen, fallback.showScoresOnScreen)
      : false,
    showFinalScoreOnScreen: scoringEnabled
      ? normalizeBoolean(value?.showFinalScoreOnScreen, fallback.showFinalScoreOnScreen)
      : false,
    showRankingOnScreen: scoringEnabled
      ? normalizeBoolean(value?.showRankingOnScreen, fallback.showRankingOnScreen)
      : false,
    selfDrawEnabled: normalizeBoolean(value?.selfDrawEnabled, fallback.selfDrawEnabled),
  };
};

export const pickReviewScreenDisplaySettings = (
  value: ReviewScreenDisplaySettings,
): ReviewScreenDisplaySettings => ({
  scoringEnabled: value.scoringEnabled,
  showScoresOnScreen: value.showScoresOnScreen,
  showFinalScoreOnScreen: value.showFinalScoreOnScreen,
  showRankingOnScreen: value.showRankingOnScreen,
  selfDrawEnabled: value.selfDrawEnabled,
});
