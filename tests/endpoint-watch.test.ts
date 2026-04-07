import { describe, expect, it } from "vitest";
import {
  cloneParsedEndpointWatchRules,
  createEndpointWatchCollector,
  createUntrackedRepeatApiCollector,
  getResponseSizeBytes,
  methodsMatch,
  responseMatchesAnyEndpointRule,
  urlMatchesRule,
  waitForTrackedEndpointResponses,
} from "../src/endpoint-watch.js";
import type { ParsedEndpointWatchRule } from "../src/types.js";

function ruleIncludes(sub: string): ParsedEndpointWatchRule {
  return {
    id: "t",
    urlIncludes: sub,
    method: "GET",
    compiledRegex: null,
  };
}

function ruleRegex(source: string, flags = ""): ParsedEndpointWatchRule {
  return {
    id: "t",
    urlRegex: source,
    urlRegexFlags: flags || undefined,
    method: "GET",
    compiledRegex: new RegExp(source, flags),
  };
}

describe("methodsMatch", () => {
  it("is case-insensitive", () => {
    expect(methodsMatch("get", "GET")).toBe(true);
    expect(methodsMatch("POST", "post")).toBe(true);
  });
});

describe("urlMatchesRule", () => {
  it("matches substring", () => {
    const r = ruleIncludes("/api/foo");
    expect(
      urlMatchesRule("https://x.com/api/foo?a=1", r),
    ).toBe(true);
    expect(urlMatchesRule("https://x.com/api/bar", r)).toBe(false);
  });

  it("matches regex on full URL", () => {
    const r = ruleRegex("^https://x\\.com/api/foo$");
    expect(urlMatchesRule("https://x.com/api/foo", r)).toBe(true);
    expect(urlMatchesRule("https://x.com/api/foo/", r)).toBe(false);
  });

  it("respects regex flags", () => {
    const r = ruleRegex("^HTTPS://X.COM/API$", "i");
    expect(urlMatchesRule("https://x.com/api", r)).toBe(true);
  });

  it("matches global regex on every call (no stale lastIndex)", () => {
    const r = ruleRegex("foo", "g");
    expect(urlMatchesRule("https://x.com/foo-a", r)).toBe(true);
    expect(urlMatchesRule("https://x.com/foo-b", r)).toBe(true);
  });
});

describe("cloneParsedEndpointWatchRules", () => {
  it("gives each rule a new RegExp instance", () => {
    const a: ParsedEndpointWatchRule[] = [
      { ...ruleRegex("x", "g"), id: "a" },
    ];
    const b = cloneParsedEndpointWatchRules(a);
    expect(b[0]!.compiledRegex).not.toBe(a[0]!.compiledRegex);
    expect(b[0]!.compiledRegex?.source).toBe("x");
  });
});

describe("responseMatchesAnyEndpointRule", () => {
  it("returns true when any rule matches URL and method", () => {
    const rules = [ruleIncludes("/api/a"), ruleIncludes("/api/b")];
    expect(
      responseMatchesAnyEndpointRule("https://x.com/api/a", "GET", rules),
    ).toBe(true);
    expect(
      responseMatchesAnyEndpointRule("https://x.com/api/c", "GET", rules),
    ).toBe(false);
  });

  it("requires method match", () => {
    const rules = [ruleIncludes("/api")];
    expect(
      responseMatchesAnyEndpointRule("https://x.com/api", "POST", rules),
    ).toBe(false);
  });
});

describe("createUntrackedRepeatApiCollector", () => {
  function mockResponse(
    url: string,
    method: string,
    resourceType: string,
  ) {
    return {
      url: () => url,
      request: () => ({
        method: () => method,
        resourceType: () => resourceType,
      }),
    };
  }

  it("ignores non-xhr/fetch", () => {
    const c = createUntrackedRepeatApiCollector([]);
    c.onResponse(mockResponse("https://x.com/a.js", "GET", "script") as never);
    c.onResponse(mockResponse("https://x.com/a.js", "GET", "script") as never);
    expect(c.snapshot()).toEqual([]);
  });

  it("lists only untracked xhr/fetch with count > 1", () => {
    const rules = [ruleIncludes("/tracked")];
    const c = createUntrackedRepeatApiCollector(rules);
    const u = "https://x.com/untracked";
    const t = "https://x.com/tracked";
    for (let i = 0; i < 3; i++) {
      c.onResponse(mockResponse(u, "GET", "xhr") as never);
    }
    c.onResponse(mockResponse(t, "GET", "xhr") as never);
    c.onResponse(mockResponse(t, "GET", "xhr") as never);
    const snap = c.snapshot();
    expect(snap).toEqual([{ method: "GET", url: u, count: 3 }]);
  });

  it("with no rules, all xhr/fetch are untracked", () => {
    const c = createUntrackedRepeatApiCollector([]);
    const u = "https://x.com/z";
    c.onResponse(mockResponse(u, "GET", "fetch") as never);
    c.onResponse(mockResponse(u, "GET", "fetch") as never);
    expect(c.snapshot()).toEqual([{ method: "GET", url: u, count: 2 }]);
  });
});

describe("createEndpointWatchCollector getCallCounts", () => {
  function mockResponse(url: string, method: string) {
    return {
      url: () => url,
      request: () => ({ method: () => method }),
      headers: () => ({}),
      body: async () => Buffer.alloc(0),
    };
  }

  it("increments callCount synchronously before snapshot body work", () => {
    const rules: ParsedEndpointWatchRule[] = [
      { ...ruleIncludes("/api/a"), id: "a" },
    ];
    const c = createEndpointWatchCollector(rules);
    c.onResponse(mockResponse("https://x.com/api/a", "GET") as never);
    expect(c.getCallCounts()).toEqual([1]);
  });

  it("counts each response at most once: first matching rule only", () => {
    const rules: ParsedEndpointWatchRule[] = [
      { ...ruleIncludes("/community"), id: "community" },
      { ...ruleIncludes("/client"), id: "client" },
    ];
    const c = createEndpointWatchCollector(rules);
    c.onResponse(
      mockResponse("https://x.com/community/clients", "GET") as never,
    );
    expect(c.getCallCounts()).toEqual([1, 0]);
  });

  it("keeps separate counters when two rules reuse the same id string", async () => {
    const dup = "api";
    const rules: ParsedEndpointWatchRule[] = [
      { ...ruleIncludes("/foo"), id: dup },
      { ...ruleIncludes("/bar"), id: dup },
    ];
    const c = createEndpointWatchCollector(rules);
    c.onResponse(mockResponse("https://x.com/foo", "GET") as never);
    c.onResponse(mockResponse("https://x.com/foo", "GET") as never);
    c.onResponse(mockResponse("https://x.com/bar", "GET") as never);
    const snap = await c.snapshot();
    expect(snap.map((s) => s.callCount)).toEqual([2, 1]);
  });
});

describe("waitForTrackedEndpointResponses", () => {
  it("resolves when waited rules have callCount >= 1", async () => {
    const rules: ParsedEndpointWatchRule[] = [
      { ...ruleIncludes("/a"), id: "a", waitForResponse: true },
      { ...ruleIncludes("/b"), id: "b" },
    ];
    let counts = [0, 0];
    const p = waitForTrackedEndpointResponses(() => counts, rules, 2000, 10);
    setTimeout(() => {
      counts = [1, 0];
    }, 30);
    await expect(p).resolves.toBeUndefined();
  });

  it("throws on timeout when rule never matches", async () => {
    const rules: ParsedEndpointWatchRule[] = [
      { ...ruleIncludes("/z"), id: "z", waitForResponse: true },
    ];
    await expect(
      waitForTrackedEndpointResponses(() => [0], rules, 80, 20),
    ).rejects.toThrow(/timeout 80ms/);
  });
});

describe("getResponseSizeBytes", () => {
  it("uses content-length when valid", async () => {
    const res = {
      headers: () => ({ "content-length": "100" }),
      body: async () => {
        throw new Error("should not read body");
      },
    };
    expect(await getResponseSizeBytes(res)).toBe(100);
  });

  it("reads body when content-length missing", async () => {
    const buf = Buffer.from("hello");
    const res = {
      headers: () => ({}),
      body: async () => buf,
    };
    expect(await getResponseSizeBytes(res)).toBe(5);
  });

  it("returns null on failure", async () => {
    const res = {
      headers: () => {
        throw new Error("boom");
      },
      body: async () => Buffer.alloc(0),
    };
    expect(await getResponseSizeBytes(res)).toBe(null);
  });
});
