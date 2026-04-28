import { createHash, randomBytes } from "node:crypto";

export type ReviewScreenSeatStatus = "pending" | "submitted" | "voided";
export type ReviewScreenSessionStatus = "waiting" | "scoring" | "revealed" | "closed";
export type ReviewScreenPhase = "draw" | "presentation" | "qa" | "scoring" | "reveal" | "finished";

export type ReviewScreenSeatInput = {
  seatNo: number;
  status: ReviewScreenSeatStatus;
  totalScoreCents?: number | null;
};

export type ReviewScreenSourceSeat = {
  assignmentId: string;
  expertUserId: string;
  expertName?: string | null;
  status: ReviewScreenSeatStatus;
  totalScoreCents?: number | null;
};

export type ReviewScreenFinalScoreOptions = {
  dropHighestCount: number;
  dropLowestCount: number;
};

export type ReviewScreenPhaseConfig = {
  presentationSeconds: number;
  qaSeconds: number;
  scoringSeconds: number;
};

export const createReviewScreenToken = () => {
  const token = randomBytes(32).toString("base64url");

  return {
    token,
    tokenHash: hashReviewScreenToken(token),
  };
};

export const hashReviewScreenToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export const formatScoreCents = (scoreCents?: number | null) =>
  typeof scoreCents === "number" && Number.isFinite(scoreCents)
    ? (scoreCents / 100).toFixed(2)
    : null;

export const buildAnonymousReviewScreenSeats = (seats: ReviewScreenSourceSeat[]) =>
  seats.map((seat, index) => ({
    assignmentId: seat.assignmentId,
    seatNo: index + 1,
    displayName: `专家 ${index + 1}`,
    avatarText: "评",
    status: seat.status,
    scoreText: seat.status === "submitted" ? formatScoreCents(seat.totalScoreCents) : null,
  }));

export const calculateReviewScreenFinalScore = (
  seats: ReviewScreenSeatInput[],
  options: ReviewScreenFinalScoreOptions,
) => {
  const voidedSeatNos = seats
    .filter((seat) => seat.status === "voided")
    .map((seat) => seat.seatNo);
  const effectiveSeats = seats.filter((seat) => seat.status !== "voided");
  const waitingSeatNos = effectiveSeats
    .filter((seat) => seat.status !== "submitted" || typeof seat.totalScoreCents !== "number")
    .map((seat) => seat.seatNo);

  if (effectiveSeats.length === 0 || waitingSeatNos.length > 0) {
    return {
      ready: false,
      effectiveSeatCount: effectiveSeats.length,
      submittedSeatCount: effectiveSeats.length - waitingSeatNos.length,
      waitingSeatNos,
      droppedSeatNos: voidedSeatNos.sort((a, b) => a - b),
      finalScoreText: null,
      finalScoreCents: null,
    };
  }

  const scoreRows = effectiveSeats
    .map((seat) => ({
      seatNo: seat.seatNo,
      scoreCents: seat.totalScoreCents ?? 0,
    }))
    .sort((left, right) => left.scoreCents - right.scoreCents);

  const requestedLowDropCount = Math.max(0, options.dropLowestCount);
  const requestedHighDropCount = Math.max(0, options.dropHighestCount);
  const requestedDropCount = requestedLowDropCount + requestedHighDropCount;
  const canApplyDropRule = requestedDropCount > 0 && scoreRows.length > requestedDropCount;
  const lowDropCount = canApplyDropRule ? requestedLowDropCount : 0;
  const highDropCount = canApplyDropRule ? requestedHighDropCount : 0;
  const lowDropped = scoreRows.slice(0, lowDropCount);
  const highDropped = highDropCount > 0 ? scoreRows.slice(-highDropCount) : [];
  const keptRows = scoreRows.slice(lowDropCount, scoreRows.length - highDropCount);
  const finalScoreCents = Math.round(
    keptRows.reduce((sum, row) => sum + row.scoreCents, 0) / keptRows.length,
  );
  const droppedSeatNos = [
    ...voidedSeatNos,
    ...lowDropped.map((row) => row.seatNo),
    ...highDropped.map((row) => row.seatNo),
  ].sort((a, b) => a - b);

  return {
    ready: true,
    effectiveSeatCount: effectiveSeats.length,
    submittedSeatCount: effectiveSeats.length,
    waitingSeatNos: [] as number[],
    droppedSeatNos,
    finalScoreText: formatScoreCents(finalScoreCents),
    finalScoreCents,
  };
};

export const getReviewScreenTimelineState = ({
  status,
  startedAt,
  countdownSeconds,
  now,
  hasFinalScore,
}: {
  status: ReviewScreenSessionStatus;
  startedAt?: string | Date | null;
  countdownSeconds: number;
  now?: Date;
  hasFinalScore: boolean;
}) => {
  if (status === "closed") {
    return { phase: "closed" as const, remainingSeconds: 0, label: "评审已结束" };
  }

  if (hasFinalScore || status === "revealed") {
    return { phase: "revealed" as const, remainingSeconds: 0, label: "最终得分已生成" };
  }

  if (status === "waiting" || !startedAt) {
    return { phase: "waiting" as const, remainingSeconds: countdownSeconds, label: "等待开始" };
  }

  const startedTime = new Date(startedAt).getTime();
  const nowTime = (now ?? new Date()).getTime();
  const remainingSeconds = Math.max(0, Math.ceil((startedTime + countdownSeconds * 1000 - nowTime) / 1000));

  if (remainingSeconds === 0) {
    return { phase: "overtime" as const, remainingSeconds, label: "等待全部专家提交" };
  }

  return { phase: "scoring" as const, remainingSeconds, label: "评分进行中" };
};

export const getPhaseCountdownSeconds = (
  phase: ReviewScreenPhase,
  config: ReviewScreenPhaseConfig & { countdownSeconds?: number },
): number => {
  switch (phase) {
    case "presentation":
      return config.presentationSeconds;
    case "qa":
      return config.qaSeconds;
    case "scoring":
      return config.scoringSeconds ?? config.countdownSeconds ?? 60;
    default:
      return 0;
  }
};

export const getPhaseLabel = (phase: ReviewScreenPhase): string => {
  switch (phase) {
    case "draw":
      return "抽签排序";
    case "presentation":
      return "路演展示";
    case "qa":
      return "答辩提问";
    case "scoring":
      return "评分进行中";
    case "reveal":
      return "最终得分";
    case "finished":
      return "本轮结束";
    default:
      return "等待开始";
  }
};

export const getPhaseRemainingSeconds = ({
  phase,
  phaseStartedAt,
  config,
  now,
}: {
  phase: ReviewScreenPhase;
  phaseStartedAt?: string | Date | null;
  config: ReviewScreenPhaseConfig & { countdownSeconds?: number };
  now?: Date;
}): number => {
  const totalSeconds = getPhaseCountdownSeconds(phase, config);
  if (totalSeconds <= 0 || !phaseStartedAt) return 0;

  const startedTime = new Date(phaseStartedAt).getTime();
  const nowTime = (now ?? new Date()).getTime();
  return Math.max(0, Math.ceil((startedTime + totalSeconds * 1000 - nowTime) / 1000));
};

export const getRevealAnimationProgress = ({
  revealStartedAt,
  durationSeconds = 3,
  now,
}: {
  revealStartedAt?: string | Date | null;
  durationSeconds?: number;
  now?: Date;
}): number => {
  if (!revealStartedAt) return 0;
  const startedTime = new Date(revealStartedAt).getTime();
  const nowTime = (now ?? new Date()).getTime();
  const elapsed = (nowTime - startedTime) / 1000;
  return Math.min(1, Math.max(0, elapsed / durationSeconds));
};

export const shuffleArray = <T>(array: T[]): T[] => {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};
