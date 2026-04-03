import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { chromium, type Browser, type Page } from "playwright";
import { applyLocalStorageInitScript } from "./local-storage-inject.js";
import {
  createEndpointWatchCollector,
  createUntrackedRepeatApiCollector,
  waitForTrackedEndpointResponses,
} from "./endpoint-watch.js";
import type {
  NavigationMetrics,
  ParsedEndpointWatchRule,
  RequestMetric,
  RunResult,
} from "./types.js";

export type MeasureRunOptions = {
  run: number;
  baseURL: string;
  gotoURL: string;
  storageState?: string;
  /** Absolute path to flat JSON for localStorage injection. */
  localStorageState?: string;
  headless: boolean;
  readyVisible: string;
  readyHidden: string;
  skipReadyHidden: boolean;
  navigationTimeoutMs: number;
  readyTimeoutMs: number;
  readyHiddenTimeoutMs: number;
  /** Used when any `endpointWatch` rule has `waitForResponse: true`. */
  waitForEndpointsTimeoutMs: number;
  traceDir: string;
  screenshotDir: string;
  filePrefix: string;
  /** Reuse one browser across runs (suite); fresh context per run. */
  sharedBrowser?: Browser;
  /** Record Playwright trace zip. Default false. */
  recordTrace?: boolean;
  /** Save after-ready PNG. Default false. */
  recordScreenshot?: boolean;
  /** Attach listeners for full request list / slowestRequests. Default false. */
  recordRequests?: boolean;
  /** Full-page vs viewport when screenshotting. Default false. */
  fullPageScreenshot?: boolean;
  /** DOM snapshots inside trace. Default false. */
  traceSnapshots?: boolean;
  /** List duplicate untracked XHR/fetch. Default true. */
  reportUntrackedRepeatApis?: boolean;
  endpointWatch?: ParsedEndpointWatchRule[];
};

function wireNetworkCapture(page: Page) {
  const started = new Map<
    string,
    { url: string; method: string; resourceType: string; startedAt: number }
  >();
  const completed: RequestMetric[] = [];

  page.on("request", (request) => {
    started.set(
      request.url() +
        "#" +
        request.method() +
        "#" +
        request.resourceType() +
        "#" +
        performance.now(),
      {
        url: request.url(),
        method: request.method(),
        resourceType: request.resourceType(),
        startedAt: performance.now(),
      },
    );
  });

  page.on("response", (response) => {
    const request = response.request();
    const candidate = findOpenRequest(
      started,
      request.url(),
      request.method(),
      request.resourceType(),
    );
    if (!candidate) return;

    completed.push({
      url: candidate.url,
      method: candidate.method,
      status: response.status(),
      durationMs: performance.now() - candidate.startedAt,
      resourceType: candidate.resourceType,
      ok: response.ok(),
      failed: false,
    });
  });

  page.on("requestfailed", (request) => {
    const candidate = findOpenRequest(
      started,
      request.url(),
      request.method(),
      request.resourceType(),
    );
    if (!candidate) return;

    completed.push({
      url: candidate.url,
      method: candidate.method,
      status: null,
      durationMs: performance.now() - candidate.startedAt,
      resourceType: candidate.resourceType,
      ok: null,
      failed: true,
      failureText: request.failure()?.errorText,
    });
  });

  return () => completed;
}

function findOpenRequest(
  started: Map<
    string,
    { url: string; method: string; resourceType: string; startedAt: number }
  >,
  url: string,
  method: string,
  resourceType: string,
) {
  for (const [key, value] of started.entries()) {
    if (
      value.url === url &&
      value.method === method &&
      value.resourceType === resourceType
    ) {
      started.delete(key);
      return value;
    }
  }
  return null;
}

/** String form avoids test bundlers rewriting in-page `performance` references. */
const READ_NAVIGATION_METRICS_SCRIPT = `() => {
  const entries = performance.getEntriesByType("navigation");
  const nav = entries[0];
  if (!nav) {
    return {
      domContentLoadedMs: null,
      loadEventMs: null,
      responseStartMs: null,
      responseEndMs: null,
      domInteractiveMs: null,
      durationMs: null,
      type: null,
    };
  }
  return {
    domContentLoadedMs: nav.domContentLoadedEventEnd,
    loadEventMs: nav.loadEventEnd,
    responseStartMs: nav.responseStart,
    responseEndMs: nav.responseEnd,
    domInteractiveMs: nav.domInteractive,
    durationMs: nav.duration,
    type: nav.type,
  };
}`;

async function readNavigationMetrics(page: Page): Promise<NavigationMetrics> {
  return page.evaluate(READ_NAVIGATION_METRICS_SCRIPT);
}

export async function measureRun(
  options: MeasureRunOptions,
): Promise<RunResult> {
  const {
    run,
    baseURL,
    gotoURL,
    storageState,
    localStorageState,
    headless,
    readyVisible,
    readyHidden,
    skipReadyHidden,
    navigationTimeoutMs,
    readyTimeoutMs,
    readyHiddenTimeoutMs,
    waitForEndpointsTimeoutMs,
    traceDir,
    screenshotDir,
    filePrefix,
    sharedBrowser,
    recordTrace: recordTraceOpt,
    recordScreenshot: recordScreenshotOpt,
    recordRequests: recordRequestsOpt,
    fullPageScreenshot: fullPageOpt,
    traceSnapshots: traceSnapshotsOpt,
    reportUntrackedRepeatApis: reportUntrackedRepeatApisOpt,
    endpointWatch: endpointWatchOpt,
  } = options;

  const reportUntrackedRepeatApis = reportUntrackedRepeatApisOpt !== false;
  const recordTrace = recordTraceOpt === true;
  const recordScreenshot = recordScreenshotOpt === true;
  const recordRequests = recordRequestsOpt === true;
  const fullPage = fullPageOpt === true;
  const traceSnapshots = traceSnapshotsOpt === true;
  const ownBrowser = sharedBrowser === undefined;
  const browser = ownBrowser
    ? await chromium.launch({ headless })
    : sharedBrowser;

  fs.mkdirSync(traceDir, { recursive: true });
  fs.mkdirSync(screenshotDir, { recursive: true });

  const contextOptions: Parameters<typeof browser.newContext>[0] = {
    baseURL,
    viewport: { width: 1440, height: 900 },
  };
  if (storageState) {
    contextOptions.storageState = storageState;
  }

  const traceFilePath = path.join(traceDir, `${filePrefix}-run-${run}.zip`);
  let traceActive = false;

  const context = await browser.newContext(contextOptions);
  try {
    if (localStorageState) {
      await applyLocalStorageInitScript(context, localStorageState);
    }

    if (recordTrace) {
      await context.tracing.start({
        screenshots: true,
        snapshots: traceSnapshots,
      });
      traceActive = true;
    }

    const page = await context.newPage();
    const requests = recordRequests
      ? wireNetworkCapture(page)
      : () => [] as RequestMetric[];
    const rules = endpointWatchOpt ?? [];
    const endpointCollector =
      rules.length > 0 ? createEndpointWatchCollector(rules) : null;
    if (endpointCollector) {
      page.on("response", (response) => endpointCollector.onResponse(response));
    }

    const repeatCollector = reportUntrackedRepeatApis
      ? createUntrackedRepeatApiCollector(rules)
      : null;
    if (repeatCollector) {
      page.on("response", (response) => repeatCollector.onResponse(response));
    }

    const startedAt = new Date().toISOString();
    const start = performance.now();

    await page.goto(gotoURL, {
      waitUntil: "domcontentloaded",
      timeout: navigationTimeoutMs,
    });

    await page
      .locator(readyVisible)
      .waitFor({ state: "visible", timeout: readyTimeoutMs });

    if (!skipReadyHidden) {
      try {
        await page
          .locator(readyHidden)
          .waitFor({ state: "hidden", timeout: readyHiddenTimeoutMs });
      } catch {
        // Optional: some dashboards may keep polling or may not render this element.
      }
    }

    if (
      endpointCollector &&
      rules.some((r) => r.waitForResponse === true)
    ) {
      await waitForTrackedEndpointResponses(
        () => endpointCollector.getCallCounts(),
        rules,
        waitForEndpointsTimeoutMs,
      );
    }

    const readyMs = performance.now() - start;

    const navigation = await readNavigationMetrics(page);
    const allRequests = requests();
    const endpointWatch = endpointCollector
      ? await endpointCollector.snapshot()
      : [];
    const untrackedRepeatApis = repeatCollector
      ? repeatCollector.snapshot()
      : [];

    const screenshotPath = recordScreenshot
      ? path.join(screenshotDir, `${filePrefix}-run-${run}.png`)
      : "";

    if (recordScreenshot) {
      await page.screenshot({ path: screenshotPath, fullPage });
    }

    let tracePath = "";
    if (recordTrace && traceActive) {
      tracePath = traceFilePath;
      await context.tracing.stop({ path: tracePath });
      traceActive = false;
    }

    const slowestRequests = [...allRequests]
      .filter((r) => r.durationMs !== null)
      .sort((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0))
      .slice(0, 10);

    return {
      run,
      startedAt,
      url: gotoURL,
      readyMs,
      navigation,
      requests: allRequests,
      totalRequests: allRequests.length,
      failedRequests: allRequests.filter((r) => r.failed).length,
      slowestRequests,
      screenshotPath,
      tracePath,
      endpointWatch,
      untrackedRepeatApis,
    };
  } finally {
    if (traceActive) {
      await context.tracing.stop({ path: traceFilePath }).catch(() => {});
    }
    await context.close().catch(() => {});
    if (ownBrowser) {
      await browser.close().catch(() => {});
    }
  }
}
