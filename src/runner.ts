import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { chromium, type Page } from "playwright";
import type { NavigationMetrics, RequestMetric, RunResult } from "./types.js";

export type MeasureRunOptions = {
  run: number;
  baseURL: string;
  gotoURL: string;
  storageState?: string;
  headless: boolean;
  readyVisible: string;
  readyHidden: string;
  skipReadyHidden: boolean;
  navigationTimeoutMs: number;
  readyTimeoutMs: number;
  readyHiddenTimeoutMs: number;
  traceDir: string;
  screenshotDir: string;
  filePrefix: string;
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

async function readNavigationMetrics(page: Page): Promise<NavigationMetrics> {
  return page.evaluate(() => {
    const entries = (
      performance as unknown as {
        getEntriesByType(type: string): PerformanceEntry[];
      }
    ).getEntriesByType("navigation");
    const nav = entries[0] as PerformanceNavigationTiming | undefined;
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
  });
}

export async function measureRun(
  options: MeasureRunOptions,
): Promise<RunResult> {
  const {
    run,
    baseURL,
    gotoURL,
    storageState,
    headless,
    readyVisible,
    readyHidden,
    skipReadyHidden,
    navigationTimeoutMs,
    readyTimeoutMs,
    readyHiddenTimeoutMs,
    traceDir,
    screenshotDir,
    filePrefix,
  } = options;

  fs.mkdirSync(traceDir, { recursive: true });
  fs.mkdirSync(screenshotDir, { recursive: true });

  const browser = await chromium.launch({ headless });
  const contextOptions: Parameters<typeof browser.newContext>[0] = {
    baseURL,
    viewport: { width: 1440, height: 900 },
  };
  if (storageState) {
    contextOptions.storageState = storageState;
  }
  const context = await browser.newContext(contextOptions);

  await context.tracing.start({ screenshots: true, snapshots: true });

  const page = await context.newPage();
  const requests = wireNetworkCapture(page);

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

  const readyMs = performance.now() - start;

  const navigation = await readNavigationMetrics(page);
  const allRequests = requests();

  const screenshotPath = path.join(
    screenshotDir,
    `${filePrefix}-run-${run}.png`,
  );
  const tracePath = path.join(traceDir, `${filePrefix}-run-${run}.zip`);

  await page.screenshot({ path: screenshotPath, fullPage: true });
  await context.tracing.stop({ path: tracePath });
  await browser.close();

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
  };
}
