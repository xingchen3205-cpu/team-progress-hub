import type { NextConfig } from "next";
import { getAllowedDevOrigins } from "./src/lib/dev-origin-config";
import { securityHeaders } from "./src/lib/security";

const nextConfig: NextConfig = {
  allowedDevOrigins: getAllowedDevOrigins(),
  compress: true,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [...securityHeaders],
      },
    ];
  },
  // Next.js App Router route handlers do not support api.bodyParser in next.config.
  // Upload size is enforced in src/lib/file-policy.ts and the document upload APIs.
};

export default nextConfig;
