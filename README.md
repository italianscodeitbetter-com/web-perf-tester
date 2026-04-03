# icib-perf-web-tester

Measure **time-to-ready** for web pages with [Playwright](https://playwright.dev): navigate, wait for a visible selector (and optionally a hidden loading selector), repeat over several runs, and compare against a **JSON-defined budget** for CI. Optionally **watch API URLs** (substring or regex on the full request URL), count matching responses per run, record **response sizes**, and fail if **`maxCalls`** or **`maxTotalResponseBytes`** budgets are exceeded.

## Requirements

- Node.js 18+
- Chromium for Playwright: `npx playwright install chromium`

**AI / MCP agents:** [AGENTS.md](./AGENTS.md) is a **self-contained** reference (config, CLIs, pass/fail, API, artifacts)—no other doc required for integration.

### Speed & default telemetry

**By default** the runner only measures what you need for budgets: **`readyMs`**, navigation timing, and **`endpointWatch`** (matched API counts / sizes). It does **not** record Playwright traces, **does not** save screenshots, and **does not** attach listeners for the full HTTP request list — those are all **opt-in** (see below). One **Chromium** is reused for all **`runs`** of each page.

To **debug** a failure, turn artifacts back on in JSON: **`"recordTrace": true`**, **`"recordScreenshot": true`**, **`"recordRequests": true`** (full request log / `slowestRequests`), and optionally **`"fullPageScreenshot": true`** or **`"traceSnapshots": true`**.

## Install

In the app you want to test:

```bash
npm install -D icib-perf-web-tester playwright
npx icib-perf-web-tester init
```

`init` copies **`perf.config.example.json`** from the package to **`perf.config.json`** (or a path you pass), creates an empty **`{}`** file for **`localStorageState`** in the example if that path is missing (so the config loads), then runs **`npx playwright install chromium`**. Use **`--skip-browsers`** if browsers are already installed. Use **`--force`** to overwrite an existing config.

Without `init`, you can still copy the example by hand and install browsers:

```bash
cp node_modules/icib-perf-web-tester/perf.config.example.json perf.config.json
npx playwright install chromium
```

## Config

If you did not use `init`, copy the example and edit it:

`cp node_modules/icib-perf-web-tester/perf.config.example.json perf.config.json`

Paths in the JSON are resolved **relative to the config file’s directory** unless they are absolute.

```json
{
  "baseURL": "https://app.example.com",
  "storageState": ".webperf/auth.json",
  "runs": 5,
  "headless": true,
  "outputDir": ".webperf",
  "budgetMetric": "median",
  "defaults": {
    "readyVisible": "[data-test=main-chart]",
    "readyHidden": "[data-test=loading]"
  },
  "pages": [{ "url": "/dashboard/sales", "maxReadyMs": 4000 }]
}
```

- **`baseURL`** — Required. Used as Playwright `baseURL` for relative `pages[].url` values.
- **`pages`** — Required non-empty array. Each entry needs **`url`** (path or full `https://…` URL) and **`maxReadyMs`** (budget in milliseconds).
- **`budgetMetric`** — `"median"` (default) or `"p95"`. The chosen value is compared to `maxReadyMs`.
- **`storageState`** — Optional path to **Playwright** storage state (`cookies`, optional `origins`…). Not a flat token file.
- **`localStorageState`** — Optional path to **flat** JSON `{ "key": "value" }`. Each pair is applied with `localStorage.setItem` before your app runs. Use for custom keys (e.g. `accessTokenAdmin`). Same path rules as other config paths. Can be combined with `storageState`.
- **`recordTrace`** — Optional. Default **off**. Set **`true`** to write Playwright trace zips under **`traces/`**.
- **`recordScreenshot`** — Optional. Default **off**. Set **`true`** to write **`screenshots/page-*-run-*.png`** after ready.
- **`recordRequests`** — Optional. Default **off**. Set **`true`** to fill **`results.requests`** / **`slowestRequests`** (adds overhead on busy pages).
- **`fullPageScreenshot`** — Optional. Default **off** (viewport only when screenshots are on). Set **`true`** with **`recordScreenshot`** for full-page PNGs.
- **`traceSnapshots`** — Optional. Default **off**. Set **`true`** with **`recordTrace`** for DOM snapshots inside traces (heavy).
- **`reportUntrackedRepeatApis`** — Optional. Default **on**. When **`true`**, each run adds **`untrackedRepeatApis`** to **`results.json`**: XHR/fetch URLs that **do not** match any **`endpointWatch`** rule but were requested **more than once** in that run (helps spot duplicate or missing rules). Set **`false`** to disable.
- **`readyHidden`** — Set to `""` in defaults or on a page to skip the “wait until hidden” step.

### `endpointWatch` (optional)

Define rules on **`defaults.endpointWatch`** (applies to every page that does **not** set its own `endpointWatch`) and/or on **`pages[].endpointWatch`** (replaces defaults for that page only). Each rule must have **exactly one** of:

- **`urlIncludes`** — substring match on the full URL (`https://…` including query), or
- **`urlRegex`** — regex **pattern** only (not `/…/flags`), with optional **`urlRegexFlags`** (e.g. `"i"`).

Optional: **`id`** (defaults to the include string or regex), **`method`** (default `GET`), **`maxCalls`** (fail a run if more matching responses than this), **`maxTotalResponseBytes`** (fail a run if the sum of body sizes for matching responses exceeds this), **`waitForResponse`** (when **`true`**, after **`readyVisible`** / **`readyHidden`** the run **polls** until each such rule has at least one matching XHR/fetch response, or **`waitForEndpointsTimeoutMs`** elapses and the run **fails**). Use this when the UI becomes “ready” before the API you care about finishes. Size uses `Content-Length` when valid, otherwise reads the response body (for matched calls only).

On **`defaults`** or each **page**, optional **`waitForEndpointsTimeoutMs`** (default **30000**) caps that wait.

In JSON, **escape backslashes** in regex patterns (e.g. `\\d` for `\d`).

See [perf.config.example.json](./perf.config.example.json) for shared defaults, regex, timeouts, and per-page overrides.

### Interactive wizard

Add or append page checks by answering prompts (writes `perf.config.json` or merges into an existing file):

```bash
npx icib-perf-add-check
npx icib-perf-add-check --config ./config/perf.config.json
```

For a **new** file, it asks for `baseURL`, optional `storageState`, optional `localStorageState` (flat JSON path), `runs`, `headless`, `outputDir`, `budgetMetric`, optional shared **defaults** (selectors and timeouts), optional shared **`defaults.endpointWatch`** (substring or regex per rule), then each **page**: `url`, `maxReadyMs`, selector overrides, optional **`pages[].endpointWatch`**, and optional timeouts. For an **existing** file, it appends new `pages` only; you can still add page-level `endpointWatch` for those new pages.

## CLI

```bash
npx icib-perf-web-tester --config perf.config.json
npx icib-perf-web-tester init
npx icib-perf-web-tester init --force ./config/perf.config.json
```

| Option                      | Description                               |
| --------------------------- | ----------------------------------------- |
| `-c`, `--config <path>`     | Config file (default: `perf.config.json`) |
| `-o`, `--output-dir <path>` | Override `outputDir` from config          |
| `-h`, `--help`              | Help for the run command                  |

### `init` subcommand

| Option / argument    | Description |
| -------------------- | ----------- |
| `[dest]`             | Output path (default `perf.config.json`) |
| `-f`, `--force`      | Overwrite `dest` if it exists |
| `--skip-browsers`    | Do not run `npx playwright install chromium` |
| `-h`, `--help`       | Help for `init` |

### Exit codes

- **0** — Run: all pages pass **timing** and **`endpointWatch`** budgets. **Init:** success.
- **1** — Run: invalid config / missing files, or any budget failure. **Init:** missing example file, refused overwrite, or browser install failed.

Artifacts: **`results.json`** is always written. **`screenshots/`** and **`traces/`** only when **`recordScreenshot`** / **`recordTrace`** are **`true`**.

### npm script

```json
{
  "scripts": {
    "perf:test": "icib-perf-web-tester --config perf.config.json"
  }
}
```

## Programmatic API

```ts
import { loadConfig, runSuite } from "icib-perf-web-tester";

const config = loadConfig("perf.config.json");
const summary = await runSuite(config);
if (!summary.passed) {
  process.exitCode = 1;
}
```

For custom Playwright flows, **`applyLocalStorageInitScript(context, absPath)`** registers the same `localStorage` init script the runner uses (after `browser.newContext()`, before navigation). **`loadLocalStoragePairsFromFile(absPath)`** parses the flat JSON only.

## Develop this package

```bash
npm install
npx playwright install chromium
npm test
npm run test:integration
npm run build
node dist/cli.js --config perf.config.example.json
```

- **`npm test`** — Vitest unit tests (stats, endpoint matching, config parsing, **`init`** / **`localStorageState`** parsing, endpoint budgets).
- **`npm run test:integration`** — Playwright against a local HTTP server: **`endpointWatch`** counting and **`localStorageState`** / init-script behavior (requires Chromium installed).

## License

ISC — see [LICENSE](./LICENSE).
