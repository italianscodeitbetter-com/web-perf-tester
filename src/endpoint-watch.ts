import type {
  EndpointWatchRunStats,
  ParsedEndpointWatchRule,
} from "./types.js";

export function methodsMatch(
  requestMethod: string,
  ruleMethod: string,
): boolean {
  return requestMethod.toUpperCase() === ruleMethod.toUpperCase();
}

export function urlMatchesRule(
  fullUrl: string,
  rule: ParsedEndpointWatchRule,
): boolean {
  if (rule.compiledRegex) {
    return rule.compiledRegex.test(fullUrl);
  }
  if (rule.urlIncludes !== undefined) {
    return fullUrl.includes(rule.urlIncludes);
  }
  return false;
}

export function responseMatchesAnyEndpointRule(
  fullUrl: string,
  requestMethod: string,
  rules: ParsedEndpointWatchRule[],
): boolean {
  for (const rule of rules) {
    if (!methodsMatch(requestMethod, rule.method)) continue;
    if (urlMatchesRule(fullUrl, rule)) return true;
  }
  return false;
}

const API_LIKE_RESOURCE_TYPES = new Set(["xhr", "fetch"]);

/**
 * Count XHR/fetch responses that do not match any `endpointWatch` rule.
 * Snapshot returns only URLs with count greater than 1, sorted by count desc.
 */
export function createUntrackedRepeatApiCollector(
  rules: ParsedEndpointWatchRule[],
) {
  const counts = new Map<
    string,
    { method: string; url: string; count: number }
  >();

  function onResponse(response: {
    url: () => string;
    request: () => { method: () => string; resourceType: () => string };
  }) {
    const req = response.request();
    const rt = req.resourceType();
    if (!API_LIKE_RESOURCE_TYPES.has(rt)) return;
    const url = response.url();
    const method = req.method();
    if (
      rules.length > 0 &&
      responseMatchesAnyEndpointRule(url, method, rules)
    ) {
      return;
    }
    const key = `${method.toUpperCase()}\0${url}`;
    const cur = counts.get(key);
    if (cur) cur.count += 1;
    else counts.set(key, { method, url, count: 1 });
  }

  function snapshot() {
    return [...counts.values()]
      .filter((x) => x.count > 1)
      .sort(
        (a, b) =>
          b.count - a.count ||
          a.url.localeCompare(b.url) ||
          a.method.localeCompare(b.method),
      );
  }

  return { onResponse, snapshot };
}

/**
 * Prefer Content-Length when valid; otherwise read body (matched responses only).
 */
export async function getResponseSizeBytes(response: {
  headers: () => Record<string, string>;
  body: () => Promise<Buffer>;
}): Promise<number | null> {
  try {
    const raw = response.headers()["content-length"];
    if (raw !== undefined) {
      const n = Number.parseInt(raw, 10);
      if (Number.isFinite(n) && n >= 0) return n;
    }
    const buf = await response.body();
    return buf.byteLength;
  } catch {
    return null;
  }
}

export function createEndpointWatchCollector(rules: ParsedEndpointWatchRule[]) {
  type Agg = {
    id: string;
    urlIncludes?: string;
    urlRegex?: string;
    urlRegexFlags?: string;
    method: string;
    callCount: number;
    totalResponseBytes: number;
    responseSizesBytes: number[];
  };

  const aggs: Agg[] = rules.map((r) => ({
    id: r.id,
    urlIncludes: r.urlIncludes,
    urlRegex: r.urlRegex,
    urlRegexFlags: r.urlRegexFlags,
    method: r.method,
    callCount: 0,
    totalResponseBytes: 0,
    responseSizesBytes: [],
  }));

  const pending: Promise<void>[] = [];

  function onResponse(response: {
    url: () => string;
    request: () => { method: () => string };
    headers: () => Record<string, string>;
    body: () => Promise<Buffer>;
  }) {
    const url = response.url();
    const method = response.request().method();
    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i]!;
      if (!methodsMatch(method, rule.method)) continue;
      if (!urlMatchesRule(url, rule)) continue;
      aggs[i]!.callCount += 1;
      pending.push(
        (async () => {
          const bytes = await getResponseSizeBytes(response);
          if (bytes !== null) {
            aggs[i]!.responseSizesBytes.push(bytes);
            aggs[i]!.totalResponseBytes += bytes;
          }
        })(),
      );
    }
  }

  return {
    onResponse,
    /** Synchronous counts (incremented when a response matches, before body size work). */
    getCallCounts(): number[] {
      return aggs.map((a) => a.callCount);
    },
    async snapshot(): Promise<EndpointWatchRunStats[]> {
      await Promise.all(pending);
      return aggs.map((a) => ({
        id: a.id,
        urlIncludes: a.urlIncludes,
        urlRegex: a.urlRegex,
        urlRegexFlags: a.urlRegexFlags,
        method: a.method,
        callCount: a.callCount,
        totalResponseBytes: a.totalResponseBytes,
        responseSizesBytes: [...a.responseSizesBytes],
      }));
    },
  };
}

/**
 * After UI ready, poll until each rule with `waitForResponse: true` has `callCount >= 1`,
 * or throw when `timeoutMs` elapses.
 */
export async function waitForTrackedEndpointResponses(
  getCallCounts: () => number[],
  rules: ParsedEndpointWatchRule[],
  timeoutMs: number,
  pollIntervalMs = 50,
): Promise<void> {
  const need = rules
    .map((r, i) => (r.waitForResponse === true ? i : -1))
    .filter((i) => i >= 0);
  if (need.length === 0) return;

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const counts = getCallCounts();
    if (need.every((i) => (counts[i] ?? 0) > 0)) return;
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }

  const counts = getCallCounts();
  const missing = need
    .filter((i) => (counts[i] ?? 0) === 0)
    .map((i) => rules[i]!.id);
  throw new Error(
    `waitForEndpoints: timeout ${timeoutMs}ms; no matching response yet for rules: ${missing.join(", ")}`,
  );
}
