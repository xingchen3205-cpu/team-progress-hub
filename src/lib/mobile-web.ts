const mobileWebUserAgentPattern = /Mobile|Android|iPhone|iPad|iPod|Windows Phone|MicroMessenger|Mobi/i;

export const isMobileWebUserAgent = (userAgent?: string | null) =>
  mobileWebUserAgentPattern.test(userAgent ?? "");
