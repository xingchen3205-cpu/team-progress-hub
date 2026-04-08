import path from "node:path";

export const USERNAME_REGEX = /^[A-Za-z0-9]{4,20}$/;
export const USERNAME_RULE_HINT = "账号名仅支持 4-20 位英文字母和数字，不能使用中文。";
export const EMAIL_RULE_HINT = "请输入有效邮箱，用于接收任务、公告和日程提醒。";
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const validateUsername = (value: string) => {
  const username = value.trim();

  if (!username) {
    return "请输入账号名";
  }

  if (!USERNAME_REGEX.test(username)) {
    return USERNAME_RULE_HINT;
  }

  return null;
};

export const validateRequiredEmail = (value: string) => {
  const email = value.trim();

  if (!email) {
    return "请输入邮箱";
  }

  if (!EMAIL_REGEX.test(email)) {
    return EMAIL_RULE_HINT;
  }

  return null;
};

export const AVATAR_ACCEPT_ATTRIBUTE = ".jpg,.jpeg,.png,.webp";
export const MAX_AVATAR_UPLOAD_SIZE = 2 * 1024 * 1024;

const allowedAvatarExtensions = [".jpg", ".jpeg", ".png", ".webp"] as const;

export const validateAvatarUploadMeta = ({
  fileName,
  fileSize,
}: {
  fileName: string;
  fileSize: number;
}) => {
  const extension = path.extname(fileName).toLowerCase();

  if (!allowedAvatarExtensions.includes(extension as (typeof allowedAvatarExtensions)[number])) {
    return "头像仅支持 JPG、PNG 或 WEBP 格式";
  }

  if (fileSize > MAX_AVATAR_UPLOAD_SIZE) {
    return "头像大小不能超过 2MB";
  }

  return null;
};
