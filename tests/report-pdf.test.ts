import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { countPdfPages, writeSuiteReportPdf } from "../src/report-pdf.js";
import type { SuiteSummary } from "../src/types.js";

let tmp: string | undefined;

afterEach(() => {
  if (tmp && fs.existsSync(tmp)) {
    fs.rmSync(tmp, { recursive: true, force: true });
    tmp = undefined;
  }
});

function minimalSummary(passed = true): SuiteSummary {
  return {
    budgetMetric: "median",
    outputDir: "/tmp/.webperf",
    runOutputDir: "/tmp/.webperf/2026-06-17",
    resultFile: "/tmp/.webperf/2026-06-17/results.json",
    reportFile: "/tmp/.webperf/2026-06-17/report.pdf",
    passed,
    pages: [
      {
        url: "https://app.example.com/dashboard",
        maxReadyMs: 4000,
        budgetMetric: "median",
        metricValueMs: 1200,
        timingPassed: true,
        endpointWatchPassed: true,
        passed: true,
        runs: 2,
        medianReadyMs: 1200,
        minReadyMs: 1100,
        maxObservedReadyMs: 1300,
        p95ReadyMs: 1290,
        endpointRules: [],
        results: [
          {
            run: 1,
            startedAt: "2026-06-17T10:00:00.000Z",
            url: "https://app.example.com/dashboard",
            readyMs: 1100,
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
            endpointWatch: [],
            untrackedRepeatApis: [],
          },
          {
            run: 2,
            startedAt: "2026-06-17T10:01:00.000Z",
            url: "https://app.example.com/dashboard",
            readyMs: 1300,
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
            endpointWatch: [],
            untrackedRepeatApis: [],
          },
        ],
      },
    ],
  };
}

function largeEndpointSummary(): SuiteSummary {
  const endpointRules = Array.from({ length: 25 }, (_, i) => ({
    id: `endpoint-${i + 1}`,
    urlIncludes: `/api/v2/service-${i + 1}/data`,
    method: i % 3 === 0 ? "POST" : "GET",
    maxCalls: (i % 4) + 1,
    maxTotalResponseBytes: 50_000 + i * 10_000,
    passed: i % 5 !== 0,
    maxCallCountInAnyRun: (i % 4) + 1,
    maxTotalBytesInAnyRun: 40_000 + i * 8000,
    failedRunsMaxCalls: i % 5 === 0 ? [2, 4] : [],
    failedRunsMaxBytes: i % 7 === 0 ? [1, 3] : [],
  }));

  return {
    budgetMetric: "p95",
    outputDir: "/tmp/.webperf",
    runOutputDir: "/tmp/.webperf/2026-06-17",
    resultFile: "/tmp/.webperf/2026-06-17/results.json",
    reportFile: "/tmp/.webperf/2026-06-17/report.pdf",
    passed: false,
    pages: [
      {
        url: "https://app.example.com/operations/command-center-with-a-very-long-path-for-layout-testing",
        maxReadyMs: 3600,
        budgetMetric: "p95",
        metricValueMs: 4100,
        timingPassed: false,
        endpointWatchPassed: false,
        passed: false,
        runs: 7,
        medianReadyMs: 3800,
        minReadyMs: 3100,
        maxObservedReadyMs: 4500,
        p95ReadyMs: 4100,
        endpointRules,
        results: [3100, 3400, 3600, 3800, 4000, 4200, 4500].map((readyMs, i) => ({
          run: i + 1,
          startedAt: `2026-06-17T14:${String(i).padStart(2, "0")}:00.000Z`,
          url: "https://app.example.com/operations/command-center-with-a-very-long-path-for-layout-testing",
          readyMs,
          navigation: {
            domContentLoadedMs: 900,
            loadEventMs: 1200,
            responseStartMs: 160,
            responseEndMs: 480,
            domInteractiveMs: 1000,
            durationMs: 1200,
            type: "navigate",
          },
          requests: [],
          totalRequests: 90,
          failedRequests: 0,
          slowestRequests: [],
          screenshotPath: "",
          tracePath: "",
          endpointWatch: [],
          untrackedRepeatApis:
            i === 2
              ? [
                  {
                    method: "GET",
                    url: "https://app.example.com/api/legacy/untracked-resource",
                    count: 3,
                  },
                ]
              : [],
        })),
      },
    ],
  };
}

describe("writeSuiteReportPdf", () => {
  it("writes a valid PDF file", async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "perf-pdf-"));
    const dest = path.join(tmp, "report.pdf");
    await writeSuiteReportPdf(minimalSummary(), dest);
    expect(fs.existsSync(dest)).toBe(true);
    const buf = fs.readFileSync(dest);
    expect(buf.length).toBeGreaterThan(100);
    expect(buf.subarray(0, 4).toString("ascii")).toBe("%PDF");
  });

  it("renders a multi-page PDF with 25 endpoint rules", async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "perf-pdf-"));
    const dest = path.join(tmp, "report-large.pdf");
    await writeSuiteReportPdf(largeEndpointSummary(), dest);
    const buf = fs.readFileSync(dest);
    expect(buf.length).toBeGreaterThan(2000);
    expect(countPdfPages(buf)).toBeGreaterThanOrEqual(2);
  });
});
