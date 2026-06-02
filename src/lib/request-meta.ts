import type { NextRequest } from "next/server";

export const getRequestIp = (request: NextRequest) => {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (
    request.headers.get("cf-connecting-ip")?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    forwardedFor ||
    "unknown"
  );
};

export const getRequestUserAgent = (request: NextRequest) =>
  request.headers.get("user-agent")?.trim() || "unknown";
