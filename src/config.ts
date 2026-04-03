import fs from "node:fs";
import path from "node:path";
import type {
  BudgetMetric,
  PerfConfig,
  PerfDefaults,
  PerfPageConfig,
} from "./types.js";

const DEFAULT_READY_VISIBLE = "[data-test=main-chart]";
const DEFAULT_READY_HIDDEN = "[data-test=loading]";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function expectString(
  obj: Record<string, unknown>,
  key: string,
  required: true,
  ctx: string,
): string;
function expectString(
  obj: Record<string, unknown>,
  key: string,
  required: false,
  ctx: string,
): string | undefined;
function expectString(
  obj: Record<string, unknown>,
  key: string,
  required: boolean,
  ctx: string,
): string | undefined {
  const v = obj[key];
  if (v === undefined || v === null) {
    if (required) throw new Error(`${ctx}: missing required string "${key}"`);
    return undefined;
  }
  if (typeof v !== "string") {
    throw new Error(`${ctx}: "${key}" must be a string`);
  }
  return v;
}

function expectNumber(
  obj: Record<string, unknown>,
  key: string,
  required: boolean,
  ctx: string,
): number | undefined {
  const v = obj[key];
  if (v === undefined || v === null) {
    if (required) throw new Error(`${ctx}: missing required number "${key}"`);
    return undefined;
  }
  if (typeof v !== "number" || !Number.isFinite(v)) {
    throw new Error(`${ctx}: "${key}" must be a finite number`);
  }
  return v;
}

function expectBoolean(
  obj: Record<string, unknown>,
  key: string,
  ctx: string,
): boolean | undefined {
  const v = obj[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "boolean") {
    throw new Error(`${ctx}: "${key}" must be a boolean`);
  }
  return v;
}

function parseDefaults(raw: unknown, ctx: string): PerfDefaults | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!isRecord(raw)) throw new Error(`${ctx}.defaults must be an object`);
  return {
    readyVisible: expectString(raw, "readyVisible", false, `${ctx}.defaults`),
    readyHidden: expectString(raw, "readyHidden", false, `${ctx}.defaults`),
    navigationTimeoutMs: expectNumber(
      raw,
      "navigationTimeoutMs",
      false,
      `${ctx}.defaults`,
    ),
    readyTimeoutMs: expectNumber(
      raw,
      "readyTimeoutMs",
      false,
      `${ctx}.defaults`,
    ),
    readyHiddenTimeoutMs: expectNumber(
      raw,
      "readyHiddenTimeoutMs",
      false,
      `${ctx}.defaults`,
    ),
  };
}

function parseBudgetMetric(
  raw: unknown,
  ctx: string,
): BudgetMetric | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (raw !== "median" && raw !== "p95") {
    throw new Error(
      `${ctx}: budgetMetric must be "median" or "p95", got ${JSON.stringify(raw)}`,
    );
  }
  return raw;
}

function parsePage(raw: unknown, index: number): PerfPageConfig {
  const ctx = `pages[${index}]`;
  if (!isRecord(raw)) throw new Error(`${ctx} must be an object`);
  const url = expectString(raw, "url", true, ctx);
  const maxReadyMs = expectNumber(raw, "maxReadyMs", true, ctx);
  if (maxReadyMs! < 0) {
    throw new Error(`${ctx}.maxReadyMs must be >= 0`);
  }
  return {
    url,
    maxReadyMs: maxReadyMs!,
    readyVisible: expectString(raw, "readyVisible", false, ctx),
    readyHidden: expectString(raw, "readyHidden", false, ctx),
    navigationTimeoutMs: expectNumber(
      raw,
      "navigationTimeoutMs",
      false,
      ctx,
    ),
    readyTimeoutMs: expectNumber(raw, "readyTimeoutMs", false, ctx),
    readyHiddenTimeoutMs: expectNumber(
      raw,
      "readyHiddenTimeoutMs",
      false,
      ctx,
    ),
  };
}

function parseRoot(raw: unknown): PerfConfig {
  if (!isRecord(raw)) throw new Error("Config root must be a JSON object");
  const baseURL = expectString(raw, "baseURL", true, "config");
  const pagesRaw = raw.pages;
  if (!Array.isArray(pagesRaw) || pagesRaw.length === 0) {
    throw new Error('config.pages must be a non-empty array');
  }
  const pages = pagesRaw.map((p, i) => parsePage(p, i));
  return {
    baseURL,
    storageState: expectString(raw, "storageState", false, "config"),
    runs: expectNumber(raw, "runs", false, "config"),
    headless: expectBoolean(raw, "headless", "config"),
    outputDir: expectString(raw, "outputDir", false, "config"),
    budgetMetric: parseBudgetMetric(raw.budgetMetric, "config"),
    defaults: parseDefaults(raw.defaults, "config"),
    pages,
  };
}

/** Resolve path relative to config file directory unless already absolute. */
export function resolveFromConfigDir(
  configPath: string,
  p: string | undefined,
): string | undefined {
  if (p === undefined) return undefined;
  return path.isAbsolute(p) ? p : path.resolve(path.dirname(configPath), p);
}

export function loadConfig(configPath: string): PerfConfig {
  const abs = path.resolve(configPath);
  if (!fs.existsSync(abs)) {
    throw new Error(`Config file not found: ${abs}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(abs, "utf8"));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Invalid JSON in ${abs}: ${msg}`);
  }
  const config = parseRoot(parsed);
  const storageState = resolveFromConfigDir(abs, config.storageState);
  const outputDir = resolveFromConfigDir(
    abs,
    config.outputDir ?? ".webperf",
  )!;

  if (storageState !== undefined && !fs.existsSync(storageState)) {
    throw new Error(`storageState file not found: ${storageState}`);
  }

  return {
    ...config,
    storageState,
    outputDir,
  };
}

export type MergedPageOptions = {
  url: string;
  maxReadyMs: number;
  readyVisible: string;
  readyHidden: string;
  skipReadyHidden: boolean;
  navigationTimeoutMs: number;
  readyTimeoutMs: number;
  readyHiddenTimeoutMs: number;
};

export function mergePageOptions(
  defaults: PerfDefaults | undefined,
  page: PerfPageConfig,
): MergedPageOptions {
  const readyVisible =
    page.readyVisible ??
    defaults?.readyVisible ??
    DEFAULT_READY_VISIBLE;
  const readyHiddenRaw =
    page.readyHidden ?? defaults?.readyHidden ?? DEFAULT_READY_HIDDEN;
  const skipReadyHidden = readyHiddenRaw.trim() === "";
  const readyHidden = skipReadyHidden
    ? DEFAULT_READY_HIDDEN
    : readyHiddenRaw;

  return {
    url: page.url,
    maxReadyMs: page.maxReadyMs,
    readyVisible,
    readyHidden,
    skipReadyHidden,
    navigationTimeoutMs:
      page.navigationTimeoutMs ??
      defaults?.navigationTimeoutMs ??
      60_000,
    readyTimeoutMs:
      page.readyTimeoutMs ?? defaults?.readyTimeoutMs ?? 60_000,
    readyHiddenTimeoutMs:
      page.readyHiddenTimeoutMs ??
      defaults?.readyHiddenTimeoutMs ??
      15_000,
  };
}
