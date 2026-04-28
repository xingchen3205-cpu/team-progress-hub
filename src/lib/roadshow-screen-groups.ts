const groupNumberLabels = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];

const getGroupName = (index: number) => {
  const label = groupNumberLabels[index] ?? String(index + 1);
  return `第${label}组`;
};

export type RoadshowProjectOrderRow<T extends { id: string }> = {
  project: T;
  orderIndex: number;
  groupName: string;
  groupIndex: number;
  groupSlotIndex: number;
};

export const normalizeRoadshowGroupSizes = (rawSizes: unknown, projectCount: number) => {
  if (projectCount <= 0) return [];
  const sizes = Array.isArray(rawSizes)
    ? rawSizes
        .map((size) => Number(size))
        .filter((size) => Number.isFinite(size))
        .map((size) => Math.trunc(size))
        .filter((size) => size > 0)
    : [];

  if (sizes.length === 0) {
    return [projectCount];
  }

  const total = sizes.reduce((sum, size) => sum + size, 0);
  if (total !== projectCount) {
    throw new Error(`路演分组容量之和需等于项目数量（当前 ${total}/${projectCount}）`);
  }

  return sizes;
};

export const buildRoadshowProjectOrderRows = <T extends { id: string }>(
  projects: T[],
  rawGroupSizes?: unknown,
): Array<RoadshowProjectOrderRow<T>> => {
  const groupSizes = normalizeRoadshowGroupSizes(rawGroupSizes, projects.length);
  const rows: Array<RoadshowProjectOrderRow<T>> = [];
  let projectIndex = 0;

  groupSizes.forEach((groupSize, groupIndex) => {
    for (let slotIndex = 0; slotIndex < groupSize; slotIndex += 1) {
      const project = projects[projectIndex];
      if (!project) continue;
      rows.push({
        project,
        orderIndex: projectIndex,
        groupName: getGroupName(groupIndex),
        groupIndex,
        groupSlotIndex: slotIndex,
      });
      projectIndex += 1;
    }
  });

  return rows;
};
