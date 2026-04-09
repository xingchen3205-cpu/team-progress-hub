type TeamGroupCarrier = {
  teamGroupId?: string | null;
};

type TaskTeamGroupSource = {
  teamGroupId?: string | null;
  creator?: TeamGroupCarrier | null;
  reviewer?: TeamGroupCarrier | null;
  assignee?: TeamGroupCarrier | null;
  assignments?: Array<{ assignee?: TeamGroupCarrier | null }> | null;
};

export const inferTaskTeamGroupId = (task: TaskTeamGroupSource) => {
  if (task.teamGroupId) {
    return task.teamGroupId;
  }

  return (
    task.creator?.teamGroupId ??
    task.reviewer?.teamGroupId ??
    task.assignee?.teamGroupId ??
    task.assignments?.find((assignment) => assignment.assignee?.teamGroupId)?.assignee?.teamGroupId ??
    null
  );
};
