import type { Announcement, User } from "@prisma/client";

export const teacherTrainingAnnouncementStoragePrefix = "__teacher_training_announcement_v1__:";

export const buildTeacherTrainingAnnouncementStoragePrefix = (cohortId: string) =>
  `${teacherTrainingAnnouncementStoragePrefix}${encodeURIComponent(cohortId)}:`;

export const encodeTeacherTrainingAnnouncementDetail = (cohortId: string, detail: string) =>
  `${buildTeacherTrainingAnnouncementStoragePrefix(cohortId)}${encodeURIComponent(detail)}`;

export const decodeTeacherTrainingAnnouncementDetail = (detail: string) => {
  if (!detail.startsWith(teacherTrainingAnnouncementStoragePrefix)) {
    return null;
  }

  const rest = detail.slice(teacherTrainingAnnouncementStoragePrefix.length);
  const separatorIndex = rest.indexOf(":");
  if (separatorIndex < 0) {
    return null;
  }

  try {
    return {
      cohortId: decodeURIComponent(rest.slice(0, separatorIndex)),
      detail: decodeURIComponent(rest.slice(separatorIndex + 1)),
    };
  } catch {
    return null;
  }
};

export const serializeTeacherTrainingAnnouncement = (
  announcement: Announcement & {
    author: Pick<User, "id" | "name" | "avatar">;
  },
) => {
  const decoded = decodeTeacherTrainingAnnouncementDetail(announcement.detail);

  return {
    id: announcement.id,
    title: announcement.title,
    detail: decoded?.detail ?? announcement.detail,
    createdAt: announcement.createdAt.toISOString(),
    teacherTrainingCohortId: decoded?.cohortId ?? null,
    author: announcement.author,
  };
};
