export const USERNAME_REGEX = /^[A-Za-z0-9]{4,20}$/;
export const USERNAME_RULE_HINT = "账号名仅支持 4-20 位英文字母和数字，不能使用中文。";
export const EMAIL_RULE_HINT = "请输入有效邮箱，用于接收任务、公告和日程提醒。";
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COMMON_PASSWORDS = new Set(["123456", "12345678", "111111", "000000", "password", "qwerty"]);

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

export const validatePasswordPolicy = (
  value: string,
  options: {
    username?: string | null;
    phone?: string | null;
    disallowDefaultPassword?: boolean;
  } = {},
) => {
  const password = value.trim();
  const username = options.username?.trim() ?? "";
  const phoneDigits = options.phone?.replace(/\D/g, "") ?? "";

  if (!password) {
    return "请输入新密码";
  }

  if (password.length < 8) {
    return "密码至少需要 8 位";
  }

  if (password.length > 16) {
    return "密码不能超过 16 位";
  }

  if (options.disallowDefaultPassword && password === "123456") {
    return "不能继续使用初始密码 123456";
  }

  if (username && password.toLocaleLowerCase("zh-CN") === username.toLocaleLowerCase("zh-CN")) {
    return "密码不能与登录账号相同";
  }

  if (phoneDigits && password === phoneDigits) {
    return "密码不能与手机号相同";
  }

  if (COMMON_PASSWORDS.has(password.toLocaleLowerCase("zh-CN"))) {
    return "密码过于常见，请换一个更安全的密码";
  }

  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
    return "密码需要包含大写字母、小写字母和数字";
  }

  return null;
};

export const AVATAR_ACCEPT_ATTRIBUTE = ".jpg,.jpeg,.png,.webp";
export const MAX_AVATAR_UPLOAD_SIZE = 2 * 1024 * 1024;

const allowedAvatarExtensions = [".jpg", ".jpeg", ".png", ".webp"] as const;

const getFileExtension = (fileName: string) => {
  const slashIndex = Math.max(fileName.lastIndexOf("/"), fileName.lastIndexOf("\\"));
  const baseName = slashIndex >= 0 ? fileName.slice(slashIndex + 1) : fileName;
  const dotIndex = baseName.lastIndexOf(".");

  return dotIndex > 0 ? baseName.slice(dotIndex).toLowerCase() : "";
};

export const validateAvatarUploadMeta = ({
  fileName,
  fileSize,
}: {
  fileName: string;
  fileSize: number;
}) => {
  const extension = getFileExtension(fileName);

  if (!allowedAvatarExtensions.includes(extension as (typeof allowedAvatarExtensions)[number])) {
    return "头像仅支持 JPG、PNG 或 WEBP 格式";
  }

  if (fileSize > MAX_AVATAR_UPLOAD_SIZE) {
    return "头像大小不能超过 2MB";
  }

  return null;
};
