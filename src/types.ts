export type BudgetMetric = "median" | "p95";

/** Rule as stored in JSON (no RegExp — compile at runtime). */
export type EndpointWatchRule = {
  id: string;
  urlIncludes?: string;
  urlRegex?: string;
  urlRegexFlags?: string;
  method: string;
  maxCalls?: number;
  maxTotalResponseBytes?: number;
};

/** Rule ready for matching (regex compiled). */
export type ParsedEndpointWatchRule = EndpointWatchRule & {
  compiledRegex: RegExp | null;
};

export interface PerfDefaults {
  readyVisible?: string;
  readyHidden?: string;
  navigationTimeoutMs?: number;
  readyTimeoutMs?: number;
  readyHiddenTimeoutMs?: number;
  endpointWatch?: EndpointWatchRule[];
}

export interface PerfPageConfig {
  url: string;
  maxReadyMs: number;
  readyVisible?: string;
  readyHidden?: string;
  navigationTimeoutMs?: number;
  readyTimeoutMs?: number;
  readyHiddenTimeoutMs?: number;
  endpointWatch?: EndpointWatchRule[];
}

export interface PerfConfig {
  baseURL: string;
  storageState?: string;
  /**
   * Path to flat JSON `{ "key": "value" }` injected into `localStorage` before each document loads.
   * Not Playwright `storageState` format; use alongside or instead of `storageState`.
   */
  localStorageState?: string;
  runs?: number;
  headless?: boolean;
  outputDir?: string;
  budgetMetric?: BudgetMetric;
  /** When true, save an extra PNG right after navigation (before ready selectors). Final PNG is unchanged (after ready). */
  debugScreenshots?: boolean;
  defaults?: PerfDefaults;
  pages: PerfPageConfig[];
}

export type RequestMetric = {
  url: string;
  method: string;
  status: number | null;
  durationMs: number | null;
  resourceType: string;
  ok: boolean | null;
  failed: boolean;
  failureText?: string;
};

export type NavigationMetrics = {
  domContentLoadedMs: number | null;
  loadEventMs: number | null;
  responseStartMs: number | null;
  responseEndMs: number | null;
  domInteractiveMs: number | null;
  durationMs: number | null;
  type: string | null;
};

/** Per-rule stats for a single measure run. */
export type EndpointWatchRunStats = {
  id: string;
  urlIncludes?: string;
  urlRegex?: string;
  urlRegexFlags?: string;
  method: string;
  callCount: number;
  totalResponseBytes: number;
  responseSizesBytes: number[];
};

export type RunResult = {
  run: number;
  startedAt: string;
  url: string;
  readyMs: number;
  navigation: NavigationMetrics;
  requests: RequestMetric[];
  totalRequests: number;
  failedRequests: number;
  slowestRequests: RequestMetric[];
  screenshotPath: string;
  /** Set when debug screenshots are enabled: captured after `goto`, before `readyVisible`. */
  debugScreenshotBeforePath?: string;
  tracePath: string;
  endpointWatch: EndpointWatchRunStats[];
};

/** Per configured rule: budget check across all runs of a page. */
export type EndpointRuleSummary = {
  id: string;
  urlIncludes?: string;
  urlRegex?: string;
  urlRegexFlags?: string;
  method: string;
  maxCalls?: number;
  maxTotalResponseBytes?: number;
  passed: boolean;
  /** Largest callCount seen in any single run. */
  maxCallCountInAnyRun: number;
  /** Largest totalResponseBytes in any single run. */
  maxTotalBytesInAnyRun: number;
  /** Run numbers (1-based) that violated maxCalls, if any. */
  failedRunsMaxCalls: number[];
  /** Run numbers that violated maxTotalResponseBytes, if any. */
  failedRunsMaxBytes: number[];
};

export type ResolvedPageTiming = {
  url: string;
  /** Configured performance budget (ms). */
  maxReadyMs: number;
  budgetMetric: BudgetMetric;
  metricValueMs: number;
  /** Timing budget only (median/p95 vs maxReadyMs). */
  timingPassed: boolean;
  /** All endpoint watch rules satisfied on every run. */
  endpointWatchPassed: boolean;
  /** Overall page pass (timing and endpoints). */
  passed: boolean;
  runs: number;
  medianReadyMs: number;
  minReadyMs: number;
  /** Slowest single run in this page’s batch (ms). */
  maxObservedReadyMs: number;
  p95ReadyMs: number;
  endpointRules: EndpointRuleSummary[];
  results: RunResult[];
};

export type SuiteSummary = {
  budgetMetric: BudgetMetric;
  outputDir: string;
  resultFile: string;
  passed: boolean;
  pages: ResolvedPageTiming[];
};
