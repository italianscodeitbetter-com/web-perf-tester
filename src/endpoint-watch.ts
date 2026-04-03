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
