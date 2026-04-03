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
});
