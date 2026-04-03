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
  0  All pages meet their maxReadyMs budget (see budgetMetric in config)
  1  Config/load error, or at least one page over budget
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
    console.log(
      `  [${status}] ${p.url} — ${summary.budgetMetric}=${Math.round(p.metricValueMs)} ms (budget ${p.maxReadyMs} ms)`,
    );
  }

  if (!summary.passed) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
