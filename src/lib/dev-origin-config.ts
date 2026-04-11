import os from "node:os";

const DEFAULT_PUBLIC_APP_URL = "https://xingchencxcy.com";

export type AllowedDevOriginOptions = {
  appUrl?: string;
  hostname?: string;
  networkInterfaces?: ReturnType<typeof os.networkInterfaces>;
};

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

export function getAllowedDevOrigins(options: AllowedDevOriginOptions = {}) {
  const originSet = new Set<string>();

  addAppUrlHosts(originSet, options.appUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? DEFAULT_PUBLIC_APP_URL);
  addLocalHostnameAliases(originSet, options.hostname ?? os.hostname());
  addNetworkInterfaceHosts(originSet, options.networkInterfaces ?? os.networkInterfaces());

  return Array.from(originSet);
}
