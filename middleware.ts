import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { enforceSameOriginApiRequest } from "@/lib/security";

export function middleware(request: NextRequest) {
  return enforceSameOriginApiRequest(request) ?? NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
