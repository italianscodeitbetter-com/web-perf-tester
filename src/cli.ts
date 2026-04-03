import process from "node:process";
import { loadConfig } from "./config.js";
import { runSuite } from "./suite.js";

function parseArgs(argv: string[]) {
  let configPath = "perf.config.json";
  let outputDir: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--config" || a === "-c") {
      configPath = argv[++i] ?? "";
      if (!configPath) {
        throw new Error("--config requires a path");
      }
    } else if (a === "--output-dir" || a === "-o") {
      outputDir = argv[++i];
      if (!outputDir) {
        throw new Error("--output-dir requires a path");
      }
    } else if (a === "--help" || a === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  return { configPath, outputDir };
}

function printHelp() {
  console.log(`icib-perf-web-tester — Playwright web performance checks

Usage:
  icib-perf-web-tester [options]

Options:
  -c, --config <path>     JSON config (default: perf.config.json)
  -o, --output-dir <path> Override output directory from config
  -h, --help              Show this message

Exit codes:
  0  All pages pass timing (maxReadyMs) and endpointWatch budgets
  1  Config/load error, or timing or endpoint budget failure
`);
}

async function main() {
  const { configPath, outputDir } = parseArgs(process.argv.slice(2));
  const config = loadConfig(configPath);
  const summary = await runSuite(config, {
    outputDirOverride: outputDir,
  });

  console.log("\n=== Summary ===");
  console.log(`Output:    ${summary.outputDir}`);
  console.log(`Metric:    ${summary.budgetMetric}`);
  console.log(`Results:   ${summary.resultFile}`);
  for (const p of summary.pages) {
    const status = p.passed ? "PASS" : "FAIL";
    const timeOk = p.timingPassed ? "ok" : "FAIL";
    const epOk =
      p.endpointRules.length === 0
        ? "n/a"
        : p.endpointWatchPassed
          ? "ok"
          : "FAIL";
    console.log(
      `  [${status}] ${p.url} — time ${timeOk} (${summary.budgetMetric}=${Math.round(p.metricValueMs)} ms / ${p.maxReadyMs} ms) | endpoints ${epOk}`,
    );
    for (const r of p.endpointRules) {
      if (!r.passed) {
        console.log(
          `      rule ${JSON.stringify(r.id)}: maxCalls=${r.maxCallCountInAnyRun}${r.maxCalls !== undefined ? ` (budget ${r.maxCalls})` : ""} maxBytes=${r.maxTotalBytesInAnyRun}${r.maxTotalResponseBytes !== undefined ? ` (budget ${r.maxTotalResponseBytes})` : ""} failedRuns calls=${JSON.stringify(r.failedRunsMaxCalls)} bytes=${JSON.stringify(r.failedRunsMaxBytes)}`,
        );
      }
    }
  }

  if (!summary.passed) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
