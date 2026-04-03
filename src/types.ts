export type BudgetMetric = "median" | "p95";

export interface PerfDefaults {
  readyVisible?: string;
  readyHidden?: string;
  navigationTimeoutMs?: number;
  readyTimeoutMs?: number;
  readyHiddenTimeoutMs?: number;
}

export interface PerfPageConfig {
  url: string;
  maxReadyMs: number;
  readyVisible?: string;
  readyHidden?: string;
  navigationTimeoutMs?: number;
  readyTimeoutMs?: number;
  readyHiddenTimeoutMs?: number;
}

export interface PerfConfig {
  baseURL: string;
  storageState?: string;
  runs?: number;
  headless?: boolean;
  outputDir?: string;
  budgetMetric?: BudgetMetric;
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
  tracePath: string;
};

export type ResolvedPageTiming = {
  url: string;
  /** Configured performance budget (ms). */
  maxReadyMs: number;
  budgetMetric: BudgetMetric;
  metricValueMs: number;
  passed: boolean;
  runs: number;
  medianReadyMs: number;
  minReadyMs: number;
  /** Slowest single run in this page’s batch (ms). */
  maxObservedReadyMs: number;
  p95ReadyMs: number;
  results: RunResult[];
};

export type SuiteSummary = {
  budgetMetric: BudgetMetric;
  outputDir: string;
  resultFile: string;
  passed: boolean;
  pages: ResolvedPageTiming[];
};
