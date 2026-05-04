import { EMAIL_REGEX } from "@/lib/account-policy";

export type ExpertProfileInput = {
  name?: string;
  phone?: string;
  email?: string;
  organization?: string;
  title?: string;
  specialtyTags?: string[];
  specialtyTracks?: string[];
  specialtyText?: string;
  notes?: string;
};

const normalizeText = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const normalizeList = (value: unknown) =>
  Array.isArray(value)
    ? Array.from(
        new Set(
          value
            .filter((item): item is string => typeof item === "string")
            .map((item) => item.trim())
            .filter(Boolean),
        ),
      ).slice(0, 20)
    : [];

export const parseJsonList = (value: string) => {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
};

export const serializeExpertProfile = (profile: {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  organization: string | null;
  title: string | null;
  specialtyTags: string;
  specialtyTracks: string;
  specialtyText: string | null;
  notes: string | null;
  linkedUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
  linkedUser?: {
    id: string;
    name: string;
    username: string;
    email: string | null;
  } | null;
}) => ({
  id: profile.id,
  name: profile.name,
  phone: profile.phone ?? "",
  email: profile.email ?? "",
  organization: profile.organization ?? "",
  title: profile.title ?? "",
  specialtyTags: parseJsonList(profile.specialtyTags),
  specialtyTracks: parseJsonList(profile.specialtyTracks),
  specialtyText: profile.specialtyText ?? "",
  notes: profile.notes ?? "",
  linkedUserId: profile.linkedUserId,
  linkedUser: profile.linkedUser
    ? {
        id: profile.linkedUser.id,
        name: profile.linkedUser.name,
        username: profile.linkedUser.username,
        email: profile.linkedUser.email ?? "",
      }
    : null,
  accountStatus: profile.linkedUserId ? "已开通账号" : "未开通账号",
  createdAt: profile.createdAt.toISOString(),
  updatedAt: profile.updatedAt.toISOString(),
});

export const normalizeExpertProfileInput = (body: ExpertProfileInput | null) => {
  const name = normalizeText(body?.name);
  const email = normalizeText(body?.email);

  if (!name) {
    return { error: "请填写专家姓名" } as const;
  }

  if (email && !EMAIL_REGEX.test(email)) {
    return { error: "请输入有效邮箱" } as const;
  }

  return {
    data: {
      name,
      phone: normalizeText(body?.phone) || null,
      email: email || null,
      organization: normalizeText(body?.organization) || null,
      title: normalizeText(body?.title) || null,
      specialtyTags: JSON.stringify(normalizeList(body?.specialtyTags)),
      specialtyTracks: JSON.stringify(normalizeList(body?.specialtyTracks)),
      specialtyText: normalizeText(body?.specialtyText) || null,
      notes: normalizeText(body?.notes) || null,
    },
  } as const;
};
