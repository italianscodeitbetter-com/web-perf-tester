# Agent guide: `icib-perf-web-tester` (complete reference)

**Goal:** After reading this file alone, an agent should know how to **install**, **configure**, **run**, **interpret results**, and **integrate** this package in a consumer app—without opening other docs.

Human-oriented prose also lives in [README.md](./README.md); content overlaps by design.

---

## 1. What this is

| Fact        | Detail                                                                                                                                                                                                                                |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Runtime** | **Node.js 18+** only.                                                                                                                                                                                                                 |
| **Engine**  | [Playwright](https://playwright.dev) **Chromium** (install browsers separately).                                                                                                                                                      |
| **Purpose** | For each configured **page**: open URL, wait until UI is **ready** (selectors), repeat **N runs**, record metrics; optionally **count API responses** matching rules and sum **response sizes**; **fail CI** if budgets are exceeded. |
| **Config**  | One JSON file (e.g. `perf.config.json`). Paths inside it resolve **relative to that file’s directory** unless absolute.                                                                                                               |
| **Not**     | Not a browser npm import, not embedded in React/Vite bundles, not a load-testing replacement for k6.                                                                                                                                  |

---

## 2. Install (consumer app repo)

```bash
npm install -D icib-perf-web-tester playwright
npx playwright install chromium
```

- `playwright` is a **peer dependency**; keep its major version compatible with what the app uses elsewhere if possible.
- CI must run **`npx playwright install chromium`** (or cache Playwright browsers) before the perf command.

---

## 3. Binaries (npm exposes two commands)

| Binary                 | Purpose                                                                       |
| ---------------------- | ----------------------------------------------------------------------------- |
| `icib-perf-web-tester` | Run the full suite from JSON config; writes artifacts; sets exit code.        |
| `icib-perf-add-check`  | Interactive wizard: create/merge config, add pages, optional `endpointWatch`. |

Invoke via `npx <name>` or npm scripts.

---

## 4. CLI: `icib-perf-web-tester`

```
icib-perf-web-tester [options]
```

| Option                      | Meaning                                                                                                               |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `-c`, `--config <path>`     | Config JSON path. Default: `perf.config.json` (relative to **current working directory** when you start the process). |
| `-o`, `--output-dir <path>` | Override **`outputDir`** from config. Resolved with `path.resolve()` from cwd.                                        |
| `-h`, `--help`              | Print help and exit 0.                                                                                                |

**Exit codes**

| Code | Meaning                                                                                                    |
| ---- | ---------------------------------------------------------------------------------------------------------- |
| `0`  | Every page: **timing** OK **and** all **endpointWatch** rules OK (or no endpoint rules).                   |
| `1`  | Invalid/missing config, missing `storageState` / **`localStorageState`** file, or any page fails **timing** or **endpoint** budgets. |

---

## 5. CLI: `icib-perf-add-check`

```
icib-perf-add-check [options]
```

| Option                  | Meaning                                                                                             |
| ----------------------- | --------------------------------------------------------------------------------------------------- |
| `-c`, `--config <path>` | Target JSON file (default `perf.config.json`). Written relative to **cwd** unless path is absolute. |
| `-h`, `--help`          | Help.                                                                                               |

**Behavior (summary)**

- If the file **exists**: default is **merge** new `pages` entries; optional full replace with confirmation.
- **New file**: asks for `baseURL`, optional `storageState`, optional **`localStorageState`** (flat JSON path), `runs`, `headless`, `outputDir`, `budgetMetric`, optional shared **defaults** (selectors + timeouts), optional **`defaults.endpointWatch`**, then loops **pages** (`url`, `maxReadyMs`, selector overrides, optional **`pages[].endpointWatch`**, optional timeouts).
- **Endpoint prompts**: per rule, choose **substring** (`urlIncludes`) or **regex** (`urlRegex` + optional `urlRegexFlags`), then optional `id`, `method`, `maxCalls`, `maxTotalResponseBytes`.

---

## 6. JSON config: root object (`PerfConfig`)

All keys below are for the **root** of the JSON file.

| Key            | Required | Type                  | Default / notes                                                                                                                                |
| -------------- | -------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `baseURL`      | **yes**  | string                | Playwright `baseURL`. Used with **relative** `pages[].url` (e.g. `/dash` → `baseURL + /dash`).                                                 |
| `pages`        | **yes**  | array                 | Non-empty. Each item is a **page** object (section 8).                                                                                         |
| `storageState` | no       | string                | **Playwright** storage state (`cookies`, `origins`…). Resolved **relative to config file dir**. File **must exist** if set. |
| `localStorageState` | no | string           | **Flat** JSON `{ "key": "value" }` → `localStorage.setItem` via `addInitScript` before each document. Same path resolution; file **must exist** if set. Not Playwright `storageState` format. |
| `runs`         | no       | number (integer ≥ 1)  | Repetitions per page. Default **5**.                                                                                                           |
| `headless`     | no       | boolean               | Default **true**.                                                                                                                              |
| `outputDir`    | no       | string                | Artifacts root. Default **`.webperf`**. Resolved **relative to config file dir**.                                                              |
| `budgetMetric` | no       | `"median"` \| `"p95"` | Stat compared to `pages[].maxReadyMs`. Default **`median`**.                                                                                   |
| `defaults`     | no       | object                | Shared **defaults** object (section 7).                                                                                                        |

---

## 7. JSON: `defaults` (`PerfDefaults`)

Applied to every **page** that does **not** override a given field (and used for endpoint rules per merge rules in section 9).

| Key                    | Type   | Default when omitted                                                                     |
| ---------------------- | ------ | ---------------------------------------------------------------------------------------- |
| `readyVisible`         | string | `"[data-test=main-chart]"`                                                               |
| `readyHidden`          | string | `"[data-test=loading]"`. Use **`""`** to **skip** the “wait until hidden” step globally. |
| `navigationTimeoutMs`  | number | `60000` — `page.goto` timeout.                                                           |
| `readyTimeoutMs`       | number | `60000` — wait for `readyVisible`.                                                       |
| `readyHiddenTimeoutMs` | number | `15000` — wait for `readyHidden` hidden (ignored if hidden step skipped).                |
| `endpointWatch`        | array  | No shared endpoint rules. Each element: **endpoint rule** (section 10).                  |

---

## 8. JSON: each `pages[]` item (`PerfPageConfig`)

| Key                    | Required | Type         | Notes                                                                                                          |
| ---------------------- | -------- | ------------ | -------------------------------------------------------------------------------------------------------------- |
| `url`                  | **yes**  | string       | Relative to `baseURL` or absolute `http(s)://…`.                                                               |
| `maxReadyMs`           | **yes**  | number (≥ 0) | Budget for **ready time** (ms). Compared to **median** or **p95** of `readyMs` over runs (see `budgetMetric`). |
| `readyVisible`         | no       | string       | Overrides `defaults.readyVisible` for this page.                                                               |
| `readyHidden`          | no       | string       | Overrides `defaults.readyHidden`. **`""`** skips hidden wait for this page.                                    |
| `navigationTimeoutMs`  | no       | number       | Overrides default goto timeout.                                                                                |
| `readyTimeoutMs`       | no       | number       | Overrides visible selector timeout.                                                                            |
| `readyHiddenTimeoutMs` | no       | number       | Overrides hidden selector timeout.                                                                             |
| `endpointWatch`        | no       | array        | **Endpoint rules** (section 10). See **merge semantics** (section 9).                                          |

---

## 9. `endpointWatch` merge semantics (critical)

- If **`pages[i].endpointWatch` is present** (including **`[]`**), that array **replaces** `defaults.endpointWatch` entirely for that page.
- If **`pages[i].endpointWatch` is omitted**, use **`defaults.endpointWatch`** if any, else **no** endpoint rules for that page.
- To use **both** shared and extra rules on one page, **duplicate** the shared rules into that page’s `endpointWatch` array (there is no auto-concat).

---

## 10. JSON: each `endpointWatch[]` rule

**Exactly one** of `urlIncludes` **or** `urlRegex` is required. Having both or neither → **config error**.

| Key                     | Required | Type        | Notes                                                                                                                 |
| ----------------------- | -------- | ----------- | --------------------------------------------------------------------------------------------------------------------- |
| `urlIncludes`           | xor      | string      | Substring match on **full** request URL Playwright sees (`https://host/path?query`).                                  |
| `urlRegex`              | xor      | string      | Regex **pattern only** (no `/…/flags`). Tested against the **full** URL.                                              |
| `urlRegexFlags`         | no       | string      | e.g. `"i"`. Only meaningful with `urlRegex`.                                                                          |
| `id`                    | no       | string      | Label in output. Defaults to `urlIncludes`, else `urlRegex`, else `rule-{index}`.                                     |
| `method`                | no       | string      | Default **`GET`**. Compared **case-insensitively** to the request method.                                             |
| `maxCalls`              | no       | integer ≥ 0 | If set: any **single run** with **more** matching responses **fails** that rule.                                      |
| `maxTotalResponseBytes` | no       | number ≥ 0  | If set: any **single run** where the **sum** of response body sizes for matches **exceeds** this **fails** that rule. |

**Size measurement:** uses `Content-Length` when valid; otherwise reads **`response.body()`** for that response (only for **matched** URLs).

**JSON regex:** backslashes must be escaped (`\\` in JSON for one `\` in the pattern).

---

## 11. What one “run” does (per page, per iteration)

1. Launch Chromium; context with `baseURL`, optional `storageState`, viewport 1440×900.
2. If **`localStorageState`** is set: **`addInitScript`** applies each key/value to `localStorage` before every document load (same origin as navigation).
3. Start tracing; new page; network capture for request metrics.
4. If endpoint rules exist: on each **response**, match URL + method; increment counts; record sizes (async).
5. `goto` page `url` (`domcontentloaded`, `navigationTimeoutMs`).
6. Wait until `readyVisible` is visible (`readyTimeoutMs`).
7. Unless `readyHidden` is effectively skipped (`""`): try wait until `readyHidden` hidden (`readyHiddenTimeoutMs`); failure is swallowed (optional spinner).
8. Record **readyMs** (wall time from step 5 start through step 7).
9. Read navigation timing from the page; finalize request list; await all endpoint size promises.
10. Screenshot, stop trace, close browser.
11. Emit one **`RunResult`** (including `endpointWatch` stats per rule).

---

## 12. Pass/fail logic (per page, then suite)

**Timing**

- Collect `readyMs` over all runs; compute **median** and **p95**.
- `metricValueMs` = median or p95 per `budgetMetric`.
- **`timingPassed`** ⇔ `metricValueMs <= maxReadyMs`.

**Endpoints**

- For each rule with `maxCalls` / `maxTotalResponseBytes`, **each run** is checked independently.
- **`endpointWatchPassed`** ⇔ every rule passes on **every** run.
- Per-rule summary includes `failedRunsMaxCalls` / `failedRunsMaxBytes` (1-based run indices).

**Page**

- **`passed`** = `timingPassed && endpointWatchPassed`.

**Suite**

- **`SuiteSummary.passed`** ⇔ every page’s **`passed`**.

---

## 13. Artifacts (under `outputDir`)

| Path           | Content                                                                                                                                                                                               |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `results.json` | Full **`SuiteSummary`**: `budgetMetric`, `outputDir`, `resultFile`, `passed`, `pages[]` each with `timingPassed`, `endpointWatchPassed`, `passed`, stats, `endpointRules`, `results` (`RunResult[]`). |
| `screenshots/` | PNG per page run.                                                                                                                                                                                     |
| `traces/`      | Playwright trace zip per page run.                                                                                                                                                                    |

Treat `outputDir` as **disposable** in CI; add to `.gitignore` if local.

---

## 14. Programmatic API (package entry `icib-perf-web-tester`)

### 14.1 Typical CI script

```ts
import { loadConfig, runSuite } from "icib-perf-web-tester";

const config = loadConfig("perf.config.json");
const summary = await runSuite(config, {
  outputDirOverride: process.env.PERF_OUT, // optional string
});
process.exitCode = summary.passed ? 0 : 1;
```

`loadConfig` resolves **`storageState`**, **`localStorageState`**, and **`outputDir`** on disk relative to the config file; `runSuite` uses `config.outputDir` unless `outputDirOverride` is set.

### 14.2 Exports (functions)

| Export                                                   | Role                                                                           |
| -------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `loadConfig(path)`                                       | Read + validate JSON; resolve `storageState`, `localStorageState`, `outputDir`; return `PerfConfig`. |
| `runSuite(config, options?)`                             | Run all pages; write `results.json`; return `SuiteSummary`.                    |
| `measureRun(options)`                                    | Single Playwright measurement; lower-level (see `MeasureRunOptions` in types). |
| `mergePageOptions(defaults, page)`                       | Resolved selector/timeouts for a page.                                         |
| `mergeEndpointWatch(defaults, page)`                     | Resolved **`ParsedEndpointWatchRule[]`** for a page.                           |
| `compileEndpointWatchRules(rules)`                       | Attach `compiledRegex` from JSON rules.                                        |
| `resolveFromConfigDir(configPath, p)`                    | Resolve a path next to the config file.                                        |
| `applyLocalStorageInitScript(context, absPath)`          | Register Playwright init script: `localStorage.setItem` for each pair from the flat JSON file (same as the runner). |
| `loadLocalStoragePairsFromFile(absPath)`                 | Parse flat JSON file → `Record<string, string>` for custom tooling.            |
| `evaluateEndpointRules(rules, results)`                  | Compute `EndpointRuleSummary[]` from `RunResult[]`.                            |
| `percentile(values, p)`                                  | Stats helper (0–100).                                                          |
| `methodsMatch`, `urlMatchesRule`, `getResponseSizeBytes` | Endpoint matching / sizing helpers (tests or custom tooling).                  |

### 14.3 Exports (types)

`BudgetMetric`, `EndpointRuleSummary`, `EndpointWatchRule`, `EndpointWatchRunStats`, `MergedPageOptions`, `MeasureRunOptions`, `NavigationMetrics`, `ParsedEndpointWatchRule`, `PerfConfig`, `PerfDefaults`, `PerfPageConfig`, `RequestMetric`, `ResolvedPageTiming`, `RunResult`, `RunSuiteOptions`, `SuiteSummary`.

---

## 15. Integration checklist (short)

1. Add deps + `playwright install chromium`.
2. Add `perf.config.json` (copy from package `perf.config.example.json` or use wizard).
3. Set **`baseURL`**, **`pages`**, stable **`readyVisible`** / **`readyHidden`**.
4. Add npm script: `icib-perf-web-tester --config perf.config.json`.
5. `.gitignore` **`outputDir`** (and secrets): traces, screenshots, `storageState` / `localStorageState` files if sensitive.
6. Wire CI: install browsers → run script → fail on exit **1**.

---

## 16. Troubleshooting (agents)

| Symptom                                  | Likely cause                                                                                           |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `storageState file not found`            | Path in JSON wrong; remember resolution is **relative to config file**, not cwd.                       |
| `localStorageState file not found`       | Same as above for the flat JSON path.                                                                  |
| Playwright rejects `storageState`      | File is not Playwright format (e.g. flat tokens). Use **`localStorageState`** for flat `{ "key": "value" }` JSON. |
| `exactly one of urlIncludes or urlRegex` | Invalid `endpointWatch` object.                                                                        |
| `invalid urlRegex`                       | Bad pattern/flags; fix escaping in JSON.                                                               |
| Timeout on `readyVisible`                | Selector wrong, app slow, or `baseURL`/`url` wrong.                                                    |
| Endpoint count 0                         | Pattern does not match **full** URL; method mismatch; requests happen before/after measurement window. |
| CI: browser missing                      | Run `npx playwright install chromium` in CI.                                                           |

---

## 17. Example minimal config

```json
{
  "baseURL": "https://staging.example.com",
  "runs": 3,
  "headless": true,
  "outputDir": ".webperf",
  "budgetMetric": "median",
  "defaults": {
    "readyVisible": "[data-testid=app-ready]",
    "readyHidden": ""
  },
  "pages": [{ "url": "/dashboard", "maxReadyMs": 5000 }]
}
```

---

This file is shipped in the npm package as **`AGENTS.md`** so agents can read it from `node_modules/icib-perf-web-tester/AGENTS.md` after install.
