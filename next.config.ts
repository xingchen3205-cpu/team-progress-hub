import type { NextConfig } from "next";
import os from "node:os";

const DEFAULT_PUBLIC_APP_URL = "https://xingchencxcy.com";

function isIpv4Address(value: string) {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(value);
}

function addHost(originSet: Set<string>, value?: string) {
  const normalizedValue = value?.trim().toLowerCase();

  if (!normalizedValue) {
    return;
  }

  originSet.add(normalizedValue);
}

function addAppUrlHosts(originSet: Set<string>, appUrl?: string) {
  if (!appUrl) {
    return;
  }

  try {
    const hostname = new URL(appUrl).hostname.trim().toLowerCase();

    if (!hostname) {
      return;
    }

    originSet.add(hostname);

    if (hostname.startsWith("www.")) {
      originSet.add(hostname.slice(4));
      return;
    }

    if (!isIpv4Address(hostname)) {
      originSet.add(`www.${hostname}`);
    }
  } catch {
    // Ignore invalid URLs and keep the default localhost-only behavior.
  }
}

function addLocalHostnameAliases(originSet: Set<string>, hostname: string) {
  addHost(originSet, hostname);

  const hostnameWithoutLocalSuffix = hostname.endsWith(".local")
    ? hostname.slice(0, -".local".length)
    : hostname;

  addHost(originSet, hostnameWithoutLocalSuffix);

  if (hostnameWithoutLocalSuffix) {
    addHost(originSet, `${hostnameWithoutLocalSuffix}.local`);
  }
}

function addNetworkInterfaceHosts(
  originSet: Set<string>,
  networkInterfaces: ReturnType<typeof os.networkInterfaces>,
) {
  for (const entries of Object.values(networkInterfaces)) {
    for (const entry of entries ?? []) {
      if (entry.internal || entry.family !== "IPv4") {
        continue;
      }

      addHost(originSet, entry.address);
    }
  }
}

function getAllowedDevOrigins() {
  const originSet = new Set<string>();

  addAppUrlHosts(originSet, process.env.NEXT_PUBLIC_APP_URL ?? DEFAULT_PUBLIC_APP_URL);
  addLocalHostnameAliases(originSet, os.hostname());
  addNetworkInterfaceHosts(originSet, os.networkInterfaces());

  return Array.from(originSet);
}

const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "geolocation=(self), microphone=(self), camera=()",
  },
  {
    key: "Content-Security-Policy-Report-Only",
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://g.alicdn.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://api.open-meteo.com https://api.dify.ai https://api.resend.com https://api.dingtalk.com https://oapi.dingtalk.com",
      "media-src 'self' blob: data:",
      "worker-src 'self' blob:",
    ].join("; "),
  },
] as const;

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
