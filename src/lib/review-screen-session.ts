import { createHash, randomBytes } from "node:crypto";

export type ReviewScreenSeatStatus =
  | "pending"
  | "submitted"
  | "timeout"
  | "closed_by_admin"
  | "excluded"
  | "voided";
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

export type ReviewDisplaySeatSeedSource = {
  id: string;
  expertUserId: string;
};

export type ReviewScreenFinalScoreOptions = {
  dropHighestCount: number;
  dropLowestCount: number;
};

export type ReviewScreenDroppedSeatReason = "highest" | "lowest" | "excluded" | "voided";

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

export const buildReviewDisplaySeatSeeds = (assignments: ReviewDisplaySeatSeedSource[]) => {
  const seenExpertIds = new Set<string>();

  return assignments.flatMap((assignment) => {
    if (seenExpertIds.has(assignment.expertUserId)) {
      return [];
    }
    seenExpertIds.add(assignment.expertUserId);

    return [
      {
        assignmentId: assignment.id,
        expertUserId: assignment.expertUserId,
        seatNo: seenExpertIds.size,
        displayName: `专家 ${seenExpertIds.size}`,
        status: "pending" as const,
      },
    ];
  });
};

export const isExcludedReviewSeatStatus = (status: ReviewScreenSeatStatus) =>
  status === "excluded" || status === "voided";

export const calculateReviewScreenFinalScore = (
  seats: ReviewScreenSeatInput[],
  options: ReviewScreenFinalScoreOptions,
) => {
  const excludedSeatNos = seats
    .filter((seat) => isExcludedReviewSeatStatus(seat.status))
    .map((seat) => seat.seatNo);
  const excludedSeatReasons = seats
    .filter((seat) => isExcludedReviewSeatStatus(seat.status))
    .map((seat) => ({
      seatNo: seat.seatNo,
      reason: (seat.status === "voided" ? "voided" : "excluded") as ReviewScreenDroppedSeatReason,
  }));
  const effectiveSeats = seats.filter((seat) => !isExcludedReviewSeatStatus(seat.status));
  const waitingSeatNos = effectiveSeats
    .filter((seat) => seat.status !== "submitted" || typeof seat.totalScoreCents !== "number")
    .map((seat) => seat.seatNo);

  if (effectiveSeats.length === 0 || waitingSeatNos.length > 0) {
    return {
      ready: false,
      effectiveSeatCount: effectiveSeats.length,
      submittedSeatCount: effectiveSeats.length - waitingSeatNos.length,
      waitingSeatNos,
      droppedSeatNos: excludedSeatNos.sort((a, b) => a - b),
      droppedSeatReasons: excludedSeatReasons.sort((a, b) => a.seatNo - b.seatNo),
      validScoreTexts: [] as string[],
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
  const canApplyDropRule = requestedDropCount > 0 && scoreRows.length - requestedDropCount >= 2;
  const lowDropCount = canApplyDropRule ? requestedLowDropCount : 0;
  const highDropCount = canApplyDropRule ? requestedHighDropCount : 0;
  const lowDropped = scoreRows.slice(0, lowDropCount);
  const highDropped = highDropCount > 0 ? scoreRows.slice(-highDropCount) : [];
  const keptRows = scoreRows.slice(lowDropCount, scoreRows.length - highDropCount);
  const finalScoreCents = Math.round(
    keptRows.reduce((sum, row) => sum + row.scoreCents, 0) / keptRows.length,
  );
  const droppedSeatNos = [
    ...excludedSeatNos,
    ...lowDropped.map((row) => row.seatNo),
    ...highDropped.map((row) => row.seatNo),
  ].sort((a, b) => a - b);
  const droppedSeatReasons = [
    ...excludedSeatReasons,
    ...lowDropped.map((row) => ({
      seatNo: row.seatNo,
      reason: "lowest" as ReviewScreenDroppedSeatReason,
    })),
    ...highDropped.map((row) => ({
      seatNo: row.seatNo,
      reason: "highest" as ReviewScreenDroppedSeatReason,
    })),
  ].sort((a, b) => a.seatNo - b.seatNo);

  return {
    ready: true,
    effectiveSeatCount: effectiveSeats.length,
    submittedSeatCount: effectiveSeats.length,
    waitingSeatNos: [] as number[],
    droppedSeatNos,
    droppedSeatReasons,
    validScoreTexts: keptRows.map((row) => formatScoreCents(row.scoreCents) ?? "0.00"),
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
