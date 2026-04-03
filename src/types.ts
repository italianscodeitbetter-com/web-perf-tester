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
  /**
   * After UI ready steps, wait until at least one response matches this rule (or `waitForEndpointsTimeoutMs`).
   */
  waitForResponse?: boolean;
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
  /** Max time to wait for rules with `waitForResponse` after UI ready. Default 30000. */
  waitForEndpointsTimeoutMs?: number;
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
  waitForEndpointsTimeoutMs?: number;
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
  /** Playwright trace zip per run. Default false (faster); set true to record. */
  recordTrace?: boolean;
  /** PNG after ready. Default false (faster); set true to save screenshots. */
  recordScreenshot?: boolean;
  /** Log every HTTP request into `results` (slow on busy pages). Default false; set true to enable. */
  recordRequests?: boolean;
  /** When true, screenshots use full scrollable page (only if `recordScreenshot` is true). Default false. */
  fullPageScreenshot?: boolean;
  /**
   * When true, traces include DOM snapshots (heavy). Only if `recordTrace` is true.
   * Default false.
   */
  traceSnapshots?: boolean;
  /**
   * When true (default), each run lists XHR/fetch responses that match no `endpointWatch` rule
   * and occur more than once (`RunResult.untrackedRepeatApis`).
   */
  reportUntrackedRepeatApis?: boolean;
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

/** XHR/fetch not matched by any `endpointWatch` rule, called more than once in the same run. */
export type UntrackedRepeatApiCall = {
  method: string;
  url: string;
  count: number;
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
  /** Empty string when `recordScreenshot` was false. */
  screenshotPath: string;
  /** Empty string when `recordTrace` was false. */
  tracePath: string;
  endpointWatch: EndpointWatchRunStats[];
  /** Duplicate XHR/fetch calls not covered by `endpointWatch` (empty when disabled or none). */
  untrackedRepeatApis: UntrackedRepeatApiCall[];
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
