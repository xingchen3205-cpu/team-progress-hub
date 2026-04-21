const pendingJsonRequests = new Map<string, Promise<unknown>>();

const jsonMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function buildHeaders(init?: RequestInit) {
  const headers = new Headers(init?.headers ?? {});

  if (!headers.has("Content-Type") && (init?.body || jsonMethods.has((init?.method ?? "GET").toUpperCase()))) {
    headers.set("Content-Type", "application/json");
  }

  return headers;
}

function getPendingRequestKey(input: string, init?: RequestInit) {
  const method = (init?.method ?? "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    return null;
  }

  return `${method}:${input}`;
}

async function executeJsonRequest<T>(input: string, init?: RequestInit) {
  const response = await fetch(input, {
    ...init,
    credentials: "same-origin",
    headers: buildHeaders(init),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as (T & { message?: string }) | null;

  if (!response.ok) {
    throw new Error(payload?.message || "请求失败");
  }

  return payload as T;
}

export function clearPendingJsonRequests() {
  pendingJsonRequests.clear();
}

export async function requestJson<T>(input: string, init?: RequestInit) {
  const requestKey = getPendingRequestKey(input, init);
  if (!requestKey) {
    return executeJsonRequest<T>(input, init);
  }

  const existingRequest = pendingJsonRequests.get(requestKey);
  if (existingRequest) {
    return existingRequest as Promise<T>;
  }

  const request = executeJsonRequest<T>(input, init).finally(() => {
    pendingJsonRequests.delete(requestKey);
  });

  pendingJsonRequests.set(requestKey, request);
  return request;
}
