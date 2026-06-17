/**
 * Generates a sample report.pdf for preview (not part of the published package).
 * Run: npm run build && node scripts/generate-pdf-demo.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeSuiteReportPdf } from "../dist/index.js";

const root = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(root, "..", ".webperf", "demo");
const dest = path.join(outDir, "report.pdf");

const ENDPOINT_DEFS = [
  { id: "userProfile", path: "/api/v2/users/profile", method: "GET", maxCalls: 1, maxBytes: 48000 },
  { id: "notifications", path: "/api/v2/notifications/inbox", method: "GET", maxCalls: 2, maxBytes: 120000 },
  { id: "globalSearch", path: "/api/v2/search/global", method: "GET", maxCalls: 1, maxBytes: 256000 },
  { id: "salesAggregate", path: "/api/sales/aggregate", method: "GET", maxCalls: 1, maxBytes: 500000 },
  { id: "salesTrends", path: "/api/sales/trends", method: "GET", maxCalls: 2, maxBytes: 320000 },
  { id: "salesRegions", path: "/api/sales/regions", method: "GET", maxCalls: 1, maxBytes: 180000 },
  { id: "inventoryStock", path: "/api/inventory/stock-levels", method: "GET", maxCalls: 2, maxBytes: 95000 },
  { id: "warehouseSync", path: "/api/inventory/warehouse-sync", method: "POST", maxBytes: 100000 },
  { id: "purchaseOrders", path: "/api/procurement/orders", method: "GET", maxCalls: 1, maxBytes: 210000 },
  { id: "supplierCatalog", path: "/api/procurement/suppliers", method: "GET", maxCalls: 1, maxBytes: 440000 },
  { id: "billingSummary", path: "/api/finance/billing-summary", method: "GET", maxCalls: 1, maxBytes: 88000 },
  { id: "invoiceExport", path: "/api/finance/invoices/export", method: "POST", maxBytes: 150000 },
  { id: "analyticsKpis", path: "/api/analytics/kpis", method: "GET", maxCalls: 1, maxBytes: 64000 },
  { id: "analyticsFunnel", path: "/api/analytics/funnel", method: "GET", maxCalls: 2, maxBytes: 192000 },
  { id: "teamActivity", path: "/api/collaboration/activity-feed", method: "GET", maxCalls: 3, maxBytes: 280000 },
  { id: "permissions", path: "/api/auth/permissions", method: "GET", maxCalls: 1, maxBytes: 24000 },
  { id: "featureFlags", path: "/api/platform/feature-flags", method: "GET", maxCalls: 1, maxBytes: 16000 },
  { id: "auditLog", path: "/api/compliance/audit-log", method: "GET", maxCalls: 1, maxBytes: 520000 },
  { id: "cdnAssets", path: "/api/assets/manifest", method: "GET", maxCalls: 1, maxBytes: 72000 },
  { id: "geoLookup", path: "/api/geo/lookup", method: "GET", maxCalls: 1, maxBytes: 12000 },
  { id: "weatherWidget", path: "/api/widgets/weather", method: "GET", maxCalls: 2, maxBytes: 18000 },
  { id: "supportTickets", path: "/api/support/tickets/open", method: "GET", maxCalls: 1, maxBytes: 96000 },
  { id: "mlRecommendations", path: "/api/ml/recommendations", method: "POST", maxBytes: 380000 },
  { id: "sessionHeartbeat", path: "/api/session/heartbeat", method: "POST", maxCalls: 5, maxBytes: 4096 },
];

/** Rules that fail in the demo for visual variety */
const FAILING_IDS = new Set([
  "inventoryStock",
  "warehouseSync",
  "teamActivity",
  "auditLog",
  "mlRecommendations",
  "sessionHeartbeat",
]);

function buildEndpointRules() {
  return ENDPOINT_DEFS.map((def) => {
    const passed = !FAILING_IDS.has(def.id);
    const maxCallCountInAnyRun = passed
      ? def.maxCalls ?? 1
      : (def.maxCalls ?? 1) + (def.id === "sessionHeartbeat" ? 3 : 2);
    const maxTotalBytesInAnyRun = passed
      ? Math.round((def.maxBytes ?? 50000) * 0.72)
      : Math.round((def.maxBytes ?? 50000) * 1.35);

    return {
      id: def.id,
      urlIncludes: def.path,
      method: def.method,
      maxCalls: def.maxCalls,
      maxTotalResponseBytes: def.maxBytes,
      passed,
      maxCallCountInAnyRun,
      maxTotalBytesInAnyRun,
      failedRunsMaxCalls: passed
        ? []
        : def.maxCalls !== undefined
          ? [2, 4]
          : [],
      failedRunsMaxBytes: passed
        ? []
        : def.maxBytes !== undefined && !def.maxCalls
          ? [1, 3, 5]
          : [],
    };
  });
}

function buildRunResults(url, readyMsList, endpointRules) {
  return readyMsList.map((readyMs, i) => ({
    run: i + 1,
    startedAt: `2026-06-17T14:${String(i).padStart(2, "0")}:00.000Z`,
    url,
    readyMs,
    navigation: {
      domContentLoadedMs: 900 + i * 40,
      loadEventMs: 1200 + i * 50,
      responseStartMs: 160,
      responseEndMs: 480,
      domInteractiveMs: 1000,
      durationMs: 1200,
      type: "navigate",
    },
    requests: [],
    totalRequests: 85 + i * 6,
    failedRequests: i === 2 ? 1 : 0,
    slowestRequests: [],
    screenshotPath: "",
    tracePath: "",
    endpointWatch: endpointRules.map((rule) => ({
      id: rule.id,
      urlIncludes: rule.urlIncludes,
      method: rule.method,
      callCount: rule.passed
        ? Math.min(rule.maxCallCountInAnyRun, rule.maxCalls ?? 1)
        : rule.maxCallCountInAnyRun,
      totalResponseBytes: rule.passed
        ? rule.maxTotalBytesInAnyRun
        : rule.maxTotalBytesInAnyRun,
      responseSizesBytes: [rule.maxTotalBytesInAnyRun],
    })),
    untrackedRepeatApis:
      i === 2
        ? [
            {
              method: "GET",
              url: "https://app.example.com/api/legacy/categories",
              count: 4,
            },
            {
              method: "GET",
              url: "https://app.example.com/api/legacy/tags",
              count: 2,
            },
          ]
        : i === 4
          ? [
              {
                method: "GET",
                url: "https://app.example.com/api/legacy/categories",
                count: 2,
              },
            ]
          : [],
  }));
}

const platformRules = buildEndpointRules();
const platformReady = [3180, 3320, 3450, 3510, 3680, 3720, 3890];

/** @type {import("../dist/index.js").SuiteSummary} */
const demoSummary = {
  budgetMetric: "median",
  outputDir: path.join(root, "..", ".webperf"),
  runOutputDir: path.join(root, "..", ".webperf", "2026-06-17"),
  resultFile: path.join(root, "..", ".webperf", "2026-06-17", "results.json"),
  reportFile: dest,
  passed: false,
  pages: [
    {
      url: "https://app.example.com/operations/command-center",
      maxReadyMs: 3600,
      budgetMetric: "median",
      metricValueMs: 3510,
      timingPassed: true,
      endpointWatchPassed: false,
      passed: false,
      runs: platformReady.length,
      medianReadyMs: 3510,
      minReadyMs: 3180,
      maxObservedReadyMs: 3890,
      p95ReadyMs: 3842,
      endpointRules: platformRules,
      results: buildRunResults(
        "https://app.example.com/operations/command-center",
        platformReady,
        platformRules,
      ),
    },
    {
      url: "https://app.example.com/dashboard/sales",
      maxReadyMs: 4000,
      budgetMetric: "median",
      metricValueMs: 2850,
      timingPassed: true,
      endpointWatchPassed: true,
      passed: true,
      runs: 5,
      medianReadyMs: 2850,
      minReadyMs: 2410,
      maxObservedReadyMs: 3120,
      p95ReadyMs: 3088,
      endpointRules: platformRules
        .filter((r) =>
          ["salesAggregate", "salesTrends", "salesRegions", "analyticsKpis"].includes(
            r.id,
          ),
        )
        .map((r) => ({ ...r, passed: true, failedRunsMaxCalls: [], failedRunsMaxBytes: [] })),
      results: buildRunResults(
        "https://app.example.com/dashboard/sales",
        [2410, 2680, 2850, 3010, 3120],
        platformRules.filter((r) =>
          ["salesAggregate", "salesTrends", "salesRegions", "analyticsKpis"].includes(
            r.id,
          ),
        ),
      ),
    },
    {
      url: "https://app.example.com/dashboard/inventory",
      maxReadyMs: 3500,
      budgetMetric: "median",
      metricValueMs: 4120,
      timingPassed: false,
      endpointWatchPassed: false,
      passed: false,
      runs: 5,
      medianReadyMs: 4120,
      minReadyMs: 3890,
      maxObservedReadyMs: 4580,
      p95ReadyMs: 4510,
      endpointRules: platformRules.filter((r) =>
        [
          "inventoryStock",
          "warehouseSync",
          "purchaseOrders",
          "supplierCatalog",
          "geoLookup",
        ].includes(r.id),
      ),
      results: buildRunResults(
        "https://app.example.com/dashboard/inventory",
        [3890, 4010, 4120, 4350, 4580],
        platformRules.filter((r) =>
          [
            "inventoryStock",
            "warehouseSync",
            "purchaseOrders",
            "supplierCatalog",
            "geoLookup",
          ].includes(r.id),
        ),
      ),
    },
  ],
};

fs.mkdirSync(outDir, { recursive: true });
await writeSuiteReportPdf(demoSummary, dest);
console.log(
  `Demo PDF written to:\n  ${dest}\n\n` +
    `  ${ENDPOINT_DEFS.length} unique endpoints in the main page table\n` +
    `  ${demoSummary.pages.length} pages analyzed`,
);
