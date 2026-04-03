import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

type JsonEndpointRule = Record<string, unknown>;
type JsonDefaults = Record<string, unknown>;
type JsonPage = Record<string, unknown>;
type JsonConfig = Record<string, unknown> & {
  baseURL?: string;
  pages?: JsonPage[];
  defaults?: JsonDefaults;
};

function parseArgs(argv: string[]) {
  let configPath = "perf.config.json";
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--config" || a === "-c") {
      configPath = argv[++i] ?? "";
      if (!configPath) throw new Error("--config requires a path");
    } else if (a === "--help" || a === "-h") {
      printHelp();
      process.exit(0);
    }
  }
  return { configPath };
}

function printHelp() {
  console.log(`icib-perf-add-check — interactive wizard for perf.config.json

Usage:
  icib-perf-add-check [options]

Options:
  -c, --config <path>   Config file to create or update (default: perf.config.json)
  -h, --help            Show this message

You will be prompted for URLs, budgets, optional selectors, and optional
endpointWatch rules (substring or regex on full request URLs).
`);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

async function collectEndpointWatchRules(
  ask: (q: string, defaultValue?: string) => Promise<string>,
  confirm: (q: string, defaultYes?: boolean) => Promise<boolean>,
  askNumber: (q: string, defaultValue: number) => Promise<number>,
  label: string,
): Promise<JsonEndpointRule[] | undefined> {
  if (!(await confirm(`Add ${label} endpointWatch rules?`, false))) {
    return undefined;
  }
  const rules: JsonEndpointRule[] = [];
  let more = true;
  while (more) {
    const rule: JsonEndpointRule = {};
    const matchType = await ask("Match type: substring or regex", "substring");
    const useRegex = matchType.toLowerCase().startsWith("r");
    if (useRegex) {
      console.log(
        "(Regex matches the full URL including origin and query; in JSON you must escape backslashes.)",
      );
      const pat = await ask("urlRegex (pattern body only, no /slashes/)", "");
      if (!pat) {
        console.log("Skipped rule with empty pattern.");
      } else {
        rule.urlRegex = pat;
        const flags = await ask("urlRegexFlags (e.g. i, or empty)", "");
        if (flags) rule.urlRegexFlags = flags;
      }
    } else {
      const sub = await ask("urlIncludes (substring of full URL)", "");
      if (!sub) {
        console.log("Skipped rule with empty substring.");
      } else {
        rule.urlIncludes = sub;
      }
    }

    if (rule.urlRegex !== undefined || rule.urlIncludes !== undefined) {
      const defaultId =
        typeof rule.urlIncludes === "string"
          ? rule.urlIncludes
          : String(rule.urlRegex);
      rule.id = await ask("Rule id (label in results)", defaultId);
      rule.method = await ask("HTTP method", "GET");
      if (await confirm("Set maxCalls budget for this rule?", false)) {
        rule.maxCalls = await askNumber("maxCalls", 1);
      }
      if (await confirm("Set maxTotalResponseBytes budget?", false)) {
        rule.maxTotalResponseBytes = await askNumber(
          "maxTotalResponseBytes",
          100_000,
        );
      }
      pruneRuleUndefined(rule);
      rules.push(rule);
    }

    more = await confirm("Add another endpoint rule for this block?", false);
  }
  return rules.length > 0 ? rules : undefined;
}

function pruneRuleUndefined(o: JsonEndpointRule) {
  for (const k of Object.keys(o)) {
    if (o[k] === undefined) delete o[k];
  }
}

async function main() {
  const { configPath } = parseArgs(process.argv.slice(2));
  const abs = path.resolve(configPath);
  const rl = readline.createInterface({ input, output });

  const ask = async (q: string, defaultValue?: string): Promise<string> => {
    const hint =
      defaultValue !== undefined && defaultValue !== ""
        ? ` [${defaultValue}]`
        : defaultValue === ""
          ? " [empty]"
          : "";
    const line = (await rl.question(`${q}${hint}: `)).trim();
    if (line === "" && defaultValue !== undefined) return defaultValue;
    return line;
  };

  const confirm = async (q: string, defaultYes = true): Promise<boolean> => {
    const hint = defaultYes ? "Y/n" : "y/N";
    const line = (await rl.question(`${q} (${hint}): `)).trim().toLowerCase();
    if (line === "") return defaultYes;
    return line === "y" || line === "yes";
  };

  const askNumber = async (
    q: string,
    defaultValue: number,
  ): Promise<number> => {
    const raw = await ask(q, String(defaultValue));
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      console.log(`Invalid number, using ${defaultValue}.`);
      return defaultValue;
    }
    return n;
  };

  try {
    console.log(
      "\nicib-perf-add-check — add page checks to perf.config.json\n",
    );

    const exists = fs.existsSync(abs);
    let mode: "new" | "merge";
    if (exists) {
      mode = (await confirm("File exists. Merge new page(s) into it?", true))
        ? "merge"
        : "new";
      if (
        mode === "new" &&
        !(await confirm(
          "Replace the entire file? (All current settings will be lost.)",
          false,
        ))
      ) {
        console.log("Aborted.");
        rl.close();
        return;
      }
    } else {
      mode = "new";
    }

    let config: JsonConfig;

    if (mode === "merge") {
      let raw: unknown;
      try {
        raw = JSON.parse(fs.readFileSync(abs, "utf8"));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(`Could not parse ${abs}: ${msg}`);
      }
      if (!isRecord(raw) || typeof raw.baseURL !== "string") {
        throw new Error(
          `${abs} must be a JSON object with a string "baseURL" and "pages" array.`,
        );
      }
      if (!Array.isArray(raw.pages)) {
        throw new Error(`${abs} must have a "pages" array.`);
      }
      config = { ...raw } as JsonConfig;
      config.pages = [
        ...(raw.pages as unknown[]).filter(isRecord),
      ] as JsonPage[];
    } else {
      config = {};
      console.log("--- New config: global settings ---\n");
      config.baseURL = await ask(
        "baseURL (e.g. https://app.example.com)",
        "https://app.example.com",
      );
      if (!config.baseURL) {
        throw new Error("baseURL is required.");
      }

      const storage = await ask(
        "storageState path (Playwright auth JSON, relative to config file; empty to skip)",
        "",
      );
      if (storage) config.storageState = storage;

      const lsFile = await ask(
        "localStorageState path (flat JSON → localStorage; not Playwright storageState; empty to skip)",
        "",
      );
      if (lsFile) config.localStorageState = lsFile;

      config.runs = await askNumber("Number of runs per page", 5);
      config.headless = await confirm("Run headless?", true);
      config.outputDir = await ask("outputDir", ".webperf");
      const metric = await ask("budgetMetric: median or p95", "median");
      config.budgetMetric = metric === "p95" ? "p95" : "median";

      if (
        await confirm(
          "Set shared defaults (readyVisible / readyHidden / timeouts)?",
          true,
        )
      ) {
        const defaults: JsonDefaults = {};
        defaults.readyVisible = await ask(
          "defaults.readyVisible",
          "[data-test=main-chart]",
        );
        const rh = await ask(
          "defaults.readyHidden (empty = skip hidden wait globally)",
          "[data-test=loading]",
        );
        defaults.readyHidden = rh;
        defaults.navigationTimeoutMs = await askNumber(
          "defaults.navigationTimeoutMs",
          60_000,
        );
        defaults.readyTimeoutMs = await askNumber(
          "defaults.readyTimeoutMs",
          60_000,
        );
        defaults.readyHiddenTimeoutMs = await askNumber(
          "defaults.readyHiddenTimeoutMs",
          15_000,
        );
        config.defaults = defaults;
      }

      if (
        await confirm(
          "Set shared defaults.endpointWatch (all pages without their own endpointWatch)?",
          false,
        )
      ) {
        if (!config.defaults) config.defaults = {};
        const defs = config.defaults as JsonDefaults;
        const ep = await collectEndpointWatchRules(
          ask,
          confirm,
          askNumber,
          "shared defaults",
        );
        if (ep) defs.endpointWatch = ep;
      }
    }

    console.log("\n--- Page check(s) to add ---\n");

    const newPages: JsonPage[] = [];
    let addMore = true;
    while (addMore) {
      const page: JsonPage = {};
      page.url = await ask(
        "Page url (path like /dashboard or full https://…)",
        "",
      );
      if (!page.url) {
        console.log("Skipped empty url.");
      } else {
        page.maxReadyMs = await askNumber(
          "maxReadyMs (budget in ms — median or p95 must stay under this)",
          4000,
        );

        if (await confirm("Override readyVisible for this page only?", false)) {
          page.readyVisible = await ask("readyVisible", "");
          if (!page.readyVisible) delete page.readyVisible;
        }

        if (await confirm("Override readyHidden for this page only?", false)) {
          const v = await ask(
            "readyHidden (empty string = skip hidden wait for this page)",
            "",
          );
          page.readyHidden = v;
        }

        if (await confirm("Set per-page timeouts?", false)) {
          page.navigationTimeoutMs = await askNumber(
            "navigationTimeoutMs",
            60_000,
          );
          page.readyTimeoutMs = await askNumber("readyTimeoutMs", 60_000);
          page.readyHiddenTimeoutMs = await askNumber(
            "readyHiddenTimeoutMs",
            15_000,
          );
        }

        const pageEp = await collectEndpointWatchRules(
          ask,
          confirm,
          askNumber,
          "page-specific",
        );
        if (pageEp) page.endpointWatch = pageEp;

        pruneUndefined(page);
        newPages.push(page);
        console.log(
          `\nQueued page: ${page.url} (budget ${page.maxReadyMs} ms)\n`,
        );
      }

      addMore = await confirm("Add another page check?", false);
    }

    if (newPages.length === 0) {
      console.log("No pages added. Exiting.");
      rl.close();
      return;
    }

    config.pages = [...(config.pages ?? []), ...newPages];
    pruneUndefinedDeep(config);

    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, JSON.stringify(config, null, 2) + "\n", "utf8");

    console.log(`\nWrote ${newPages.length} page(s) to ${abs}`);
    console.log("Run: npx icib-perf-web-tester --config " + configPath + "\n");
  } finally {
    rl.close();
  }
}

function pruneUndefined(o: JsonPage | JsonDefaults) {
  for (const k of Object.keys(o)) {
    if (o[k] === undefined) delete o[k];
  }
}

function pruneUndefinedDeep(v: unknown): void {
  if (Array.isArray(v)) {
    for (const item of v) pruneUndefinedDeep(item);
    return;
  }
  if (!isRecord(v)) return;
  for (const k of Object.keys(v)) {
    if (v[k] === undefined) delete v[k];
    else pruneUndefinedDeep(v[k]);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
