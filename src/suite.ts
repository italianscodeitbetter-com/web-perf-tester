import fs from "node:fs";
import path from "node:path";
import type { PerfConfig } from "./types.js";
import type { SuiteSummary } from "./types.js";
import { evaluateEndpointRules } from "./endpoint-eval.js";
import { chromium } from "playwright";
import { mergeEndpointWatch, mergePageOptions } from "./config.js";
import { measureRun } from "./runner.js";
import { percentile } from "./stats.js";

function resolveGotoURL(baseURL: string, pageUrl: string): string {
  if (/^https?:\/\//i.test(pageUrl)) {
    return pageUrl;
  }
  return pageUrl;
}

export type RunSuiteOptions = {
  /** Override output directory (e.g. from CLI). Must be absolute or cwd-relative. */
  outputDirOverride?: string;
};

export async function runSuite(
  config: PerfConfig,
  options: RunSuiteOptions = {},
): Promise<SuiteSummary> {
  const runs = Math.max(1, Math.floor(config.runs ?? 5));
  const headless = config.headless !== false;
  const recordTrace = config.recordTrace === true;
  const recordScreenshot = config.recordScreenshot === true;
  const recordRequests = config.recordRequests === true;
  const fullPageScreenshot = config.fullPageScreenshot === true;
  const traceSnapshots = config.traceSnapshots === true;
  const reportUntrackedRepeatApis = config.reportUntrackedRepeatApis !== false;
  const budgetMetric = config.budgetMetric ?? "median";
  const outputDir = path.resolve(
    options.outputDirOverride ?? config.outputDir ?? ".webperf",
  );
  const traceDir = path.join(outputDir, "traces");
  const screenshotDir = path.join(outputDir, "screenshots");
  const resultFile = path.join(outputDir, "results.json");

  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(traceDir, { recursive: true });
  fs.mkdirSync(screenshotDir, { recursive: true });

  const pageSummaries: SuiteSummary["pages"] = [];

  for (let pi = 0; pi < config.pages.length; pi++) {
    const pageCfg = config.pages[pi]!;
    const merged = mergePageOptions(config.defaults, pageCfg);
    const endpointRules = mergeEndpointWatch(config.defaults, pageCfg);
    const gotoURL = resolveGotoURL(config.baseURL, merged.url);
    const filePrefix = `page-${pi}`;

    const browser = await chromium.launch({ headless });
    const results = [];
    try {
      for (let i = 1; i <= runs; i++) {
        console.log(
          `[${pi + 1}/${config.pages.length}] Run ${i}/${runs}: ${gotoURL} — starting…`,
        );
        const result = await measureRun({
          run: i,
          baseURL: config.baseURL,
          gotoURL,
          storageState: config.storageState,
          localStorageState: config.localStorageState,
          headless,
          readyVisible: merged.readyVisible,
          readyHidden: merged.readyHidden,
          skipReadyHidden: merged.skipReadyHidden,
          navigationTimeoutMs: merged.navigationTimeoutMs,
          readyTimeoutMs: merged.readyTimeoutMs,
          readyHiddenTimeoutMs: merged.readyHiddenTimeoutMs,
          waitForEndpointsTimeoutMs: merged.waitForEndpointsTimeoutMs,
          traceDir,
          screenshotDir,
          filePrefix,
          sharedBrowser: browser,
          recordTrace,
          recordScreenshot,
          recordRequests,
          fullPageScreenshot,
          traceSnapshots,
          reportUntrackedRepeatApis,
          endpointWatch: endpointRules.length > 0 ? endpointRules : undefined,
        });
        results.push(result);
        const epHint =
          endpointRules.length > 0
            ? ` | endpoints: ${result.endpointWatch.map((e) => `${e.id}=${e.callCount}`).join(", ")}`
            : "";
        const dupHint =
          result.untrackedRepeatApis.length > 0
            ? ` | untracked repeat APIs: ${result.untrackedRepeatApis.length} (see results.json → untrackedRepeatApis)`
            : "";
        console.log(
          `[${pi + 1}/${config.pages.length}] Run ${i}/${runs}: ${gotoURL} ready in ${Math.round(result.readyMs)} ms${epHint}${dupHint}`,
        );
      }
    } finally {
      await browser.close().catch(() => {});
    }

    const readyValues = results.map((r) => r.readyMs).sort((a, b) => a - b);
    const medianReadyMs = percentile(readyValues, 50);
    const p95ReadyMs = percentile(readyValues, 95);
    const metricValueMs = budgetMetric === "p95" ? p95ReadyMs : medianReadyMs;
    const timingPassed = metricValueMs <= merged.maxReadyMs;
    const endpointRuleSummaries = evaluateEndpointRules(endpointRules, results);
    const endpointWatchPassed = endpointRuleSummaries.every((e) => e.passed);
    const passed = timingPassed && endpointWatchPassed;

    pageSummaries.push({
      url: gotoURL,
      maxReadyMs: merged.maxReadyMs,
      budgetMetric,
      metricValueMs,
      timingPassed,
      endpointWatchPassed,
      passed,
      runs,
      medianReadyMs,
      minReadyMs: readyValues[0] ?? 0,
      maxObservedReadyMs: readyValues[readyValues.length - 1] ?? 0,
      p95ReadyMs,
      endpointRules: endpointRuleSummaries,
      results,
    });
  }

  const summary: SuiteSummary = {
    budgetMetric,
    outputDir,
    resultFile,
    passed: pageSummaries.every((p) => p.passed),
    pages: pageSummaries,
  };

  fs.writeFileSync(resultFile, JSON.stringify(summary, null, 2), "utf8");
  return summary;
}
