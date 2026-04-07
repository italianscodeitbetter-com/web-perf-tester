import { describe, expect, it } from "vitest";
import { evaluateEndpointRules } from "../src/endpoint-eval.js";
import type {
  ParsedEndpointWatchRule,
  RunResult,
} from "../src/types.js";

function baseRun(run: number, ep: RunResult["endpointWatch"]): RunResult {
  return {
    run,
    startedAt: new Date().toISOString(),
    url: "https://x/",
    readyMs: 1,
    navigation: {
      domContentLoadedMs: null,
      loadEventMs: null,
      responseStartMs: null,
      responseEndMs: null,
      domInteractiveMs: null,
      durationMs: null,
      type: null,
    },
    requests: [],
    totalRequests: 0,
    failedRequests: 0,
    slowestRequests: [],
    screenshotPath: "",
    tracePath: "",
    endpointWatch: ep,
    untrackedRepeatApis: [],
  };
}

describe("evaluateEndpointRules", () => {
  const rule: ParsedEndpointWatchRule = {
    id: "api",
    urlIncludes: "/api",
    method: "GET",
    maxCalls: 2,
    maxTotalResponseBytes: 1000,
    compiledRegex: null,
  };

  it("passes when within budgets", () => {
    const results = [
      baseRun(1, [
        {
          id: "api",
          method: "GET",
          callCount: 2,
          totalResponseBytes: 100,
          responseSizesBytes: [50, 50],
        },
      ]),
    ];
    const s = evaluateEndpointRules([rule], results);
    expect(s[0]!.passed).toBe(true);
    expect(s[0]!.failedRunsMaxCalls).toEqual([]);
  });

  it("fails when maxCalls exceeded", () => {
    const results = [
      baseRun(1, [
        {
          id: "api",
          method: "GET",
          callCount: 3,
          totalResponseBytes: 10,
          responseSizesBytes: [10, 10, 10],
        },
      ]),
    ];
    const s = evaluateEndpointRules([rule], results);
    expect(s[0]!.passed).toBe(false);
    expect(s[0]!.failedRunsMaxCalls).toEqual([1]);
    expect(s[0]!.maxCallCountInAnyRun).toBe(3);
  });

  it("fails when maxTotalResponseBytes exceeded", () => {
    const results = [
      baseRun(1, [
        {
          id: "api",
          method: "GET",
          callCount: 1,
          totalResponseBytes: 2000,
          responseSizesBytes: [2000],
        },
      ]),
    ];
    const s = evaluateEndpointRules([rule], results);
    expect(s[0]!.passed).toBe(false);
    expect(s[0]!.failedRunsMaxBytes).toEqual([1]);
  });

  it("does not merge stats when two rules share the same id (uses array order)", () => {
    const dupId = "same-id";
    const ruleA: ParsedEndpointWatchRule = {
      id: dupId,
      urlIncludes: "/a",
      method: "GET",
      maxCalls: 10,
      compiledRegex: null,
    };
    const ruleB: ParsedEndpointWatchRule = {
      id: dupId,
      urlIncludes: "/b",
      method: "GET",
      maxCalls: 10,
      compiledRegex: null,
    };
    const results = [
      baseRun(1, [
        {
          id: dupId,
          urlIncludes: "/a",
          method: "GET",
          callCount: 7,
          totalResponseBytes: 0,
          responseSizesBytes: [],
        },
        {
          id: dupId,
          urlIncludes: "/b",
          method: "GET",
          callCount: 2,
          totalResponseBytes: 0,
          responseSizesBytes: [],
        },
      ]),
    ];
    const s = evaluateEndpointRules([ruleA, ruleB], results);
    expect(s).toHaveLength(2);
    expect(s[0]!.maxCallCountInAnyRun).toBe(7);
    expect(s[1]!.maxCallCountInAnyRun).toBe(2);
    expect(s[0]!.passed).toBe(true);
    expect(s[1]!.passed).toBe(true);
  });
});
