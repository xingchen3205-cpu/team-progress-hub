export const competitionAiDisabledMessage = "创赛 AI 功能暂未开放";

export const isCompetitionAiEnabled = () =>
  process.env.NEXT_PUBLIC_ENABLE_COMPETITION_AI === "true" || process.env.ENABLE_COMPETITION_AI === "true";
