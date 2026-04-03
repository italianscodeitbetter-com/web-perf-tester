import { describe, expect, it } from "vitest";
import {
  getResponseSizeBytes,
  methodsMatch,
  urlMatchesRule,
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
