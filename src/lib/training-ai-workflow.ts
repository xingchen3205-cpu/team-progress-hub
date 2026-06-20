export const trainingMaxTurns = 3;
export const trainingAnswerMinLength = 10;
export const trainingAnswerMaxLength = 5000;

export type TrainingRevisionStatus = "pending" | "approved" | "rejected" | "withdrawn";

const trainingRevisionTransitions: Record<TrainingRevisionStatus, ReadonlySet<TrainingRevisionStatus>> = {
  pending: new Set(["approved", "rejected", "withdrawn"]),
  approved: new Set(),
  rejected: new Set(),
  withdrawn: new Set(),
};

export function normalizeTrainingAnswer(value: unknown) {
  const answer = `${value ?? ""}`.trim();
  if (answer.length < trainingAnswerMinLength) {
    throw new Error(`回答内容至少 ${trainingAnswerMinLength} 个字`);
  }
  if (answer.length > trainingAnswerMaxLength) {
    throw new Error(`回答内容最多 ${trainingAnswerMaxLength} 个字`);
  }
  return answer;
}

export function validateTrainingTurnNumber(value: unknown) {
  const turnNumber = Number(value);
  if (!Number.isInteger(turnNumber) || turnNumber < 1 || turnNumber > trainingMaxTurns) {
    throw new Error("每次训练仅限一至三轮问答");
  }
  return turnNumber;
}

export function canTransitionTrainingRevision(from: TrainingRevisionStatus, to: TrainingRevisionStatus) {
  return trainingRevisionTransitions[from].has(to);
}

export function canReviewTrainingRevision(
  actor: { id: string; role: string; teamGroupId?: string | null },
  request: { submittedById: string; questionCreatedById: string; teamGroupId?: string | null },
) {
  if (actor.id === request.submittedById) return false;
  if (actor.role === "admin" || actor.role === "school_admin") return true;
  if (actor.id === request.questionCreatedById) return true;
  return (
    (actor.role === "teacher" || actor.role === "leader") &&
    Boolean(actor.teamGroupId && actor.teamGroupId === request.teamGroupId)
  );
}
