import { createHash, randomBytes } from "node:crypto";

export type ReviewScreenSeatStatus = "pending" | "submitted" | "voided";
export type ReviewScreenSessionStatus = "waiting" | "scoring" | "revealed" | "closed";

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

  const lowDropCount = Math.min(
    Math.max(0, options.dropLowestCount),
    Math.max(0, scoreRows.length - 1),
  );
  const highDropCount = Math.min(
    Math.max(0, options.dropHighestCount),
    Math.max(0, scoreRows.length - lowDropCount - 1),
  );
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
