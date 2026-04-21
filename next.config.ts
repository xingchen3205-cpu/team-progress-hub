import type { NextConfig } from "next";
import { getAllowedDevOrigins } from "./src/lib/dev-origin-config";

const nextConfig: NextConfig = {
  allowedDevOrigins: getAllowedDevOrigins(),
  compress: true,
  // Next.js App Router route handlers do not support api.bodyParser in next.config.
  // Upload size is enforced in src/lib/file-policy.ts and the document upload APIs.
};

export default nextConfig;
