# icib-perf-web-tester

Measure **time-to-ready** for web pages with [Playwright](https://playwright.dev): navigate, wait for a visible selector (and optionally a hidden loading selector), repeat over several runs, and compare against a **JSON-defined budget** for CI. Optionally **watch API URLs** (substring or regex on the full request URL), count matching responses per run, record **response sizes**, and fail if **`maxCalls`** or **`maxTotalResponseBytes`** budgets are exceeded.

## Requirements

- Node.js 18+
- Chromium for Playwright: `npx playwright install chromium`

**AI / MCP agents:** [AGENTS.md](./AGENTS.md) is a **self-contained** reference (config, CLIs, pass/fail, API, artifacts)—no other doc required for integration.

## Install

In the app you want to test:

```bash
npm install -D icib-perf-web-tester playwright
npx playwright install chromium
```

## Config

Copy the example and edit it:

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
  "pages": [
    { "url": "/dashboard/sales", "maxReadyMs": 4000 }
  ]
}
```

- **`baseURL`** — Required. Used as Playwright `baseURL` for relative `pages[].url` values.
- **`pages`** — Required non-empty array. Each entry needs **`url`** (path or full `https://…` URL) and **`maxReadyMs`** (budget in milliseconds).
- **`budgetMetric`** — `"median"` (default) or `"p95"`. The chosen value is compared to `maxReadyMs`.
- **`storageState`** — Optional Playwright storage state JSON for authenticated sessions. Omit for public pages.
- **`readyHidden`** — Set to `""` in defaults or on a page to skip the “wait until hidden” step.

### `endpointWatch` (optional)

Define rules on **`defaults.endpointWatch`** (applies to every page that does **not** set its own `endpointWatch`) and/or on **`pages[].endpointWatch`** (replaces defaults for that page only). Each rule must have **exactly one** of:

- **`urlIncludes`** — substring match on the full URL (`https://…` including query), or  
- **`urlRegex`** — regex **pattern** only (not `/…/flags`), with optional **`urlRegexFlags`** (e.g. `"i"`).

Optional: **`id`** (defaults to the include string or regex), **`method`** (default `GET`), **`maxCalls`** (fail a run if more matching responses than this), **`maxTotalResponseBytes`** (fail a run if the sum of body sizes for matching responses exceeds this). Size uses `Content-Length` when valid, otherwise reads the response body (for matched calls only).

In JSON, **escape backslashes** in regex patterns (e.g. `\\d` for `\d`).

See [perf.config.example.json](./perf.config.example.json) for shared defaults, regex, timeouts, and per-page overrides.

### Interactive wizard

Add or append page checks by answering prompts (writes `perf.config.json` or merges into an existing file):

```bash
npx icib-perf-add-check
npx icib-perf-add-check --config ./config/perf.config.json
```

For a **new** file, it asks for `baseURL`, optional `storageState`, `runs`, `headless`, `outputDir`, `budgetMetric`, optional shared **defaults** (selectors and timeouts), optional shared **`defaults.endpointWatch`** (substring or regex per rule), then each **page**: `url`, `maxReadyMs`, selector overrides, optional **`pages[].endpointWatch`**, and optional timeouts. For an **existing** file, it appends new `pages` only; you can still add page-level `endpointWatch` for those new pages.

## CLI

```bash
npx icib-perf-web-tester --config perf.config.json
```

| Option | Description |
|--------|-------------|
| `-c`, `--config <path>` | Config file (default: `perf.config.json`) |
| `-o`, `--output-dir <path>` | Override `outputDir` from config |
| `-h`, `--help` | Help |

### Exit codes

- **0** — Every page passes **timing** (`budgetMetric` vs `maxReadyMs`) and all **`endpointWatch`** budgets (if any).
- **1** — Invalid config / missing files, or any timing or endpoint budget failure.

Artifacts are written under `outputDir`: `results.json`, `screenshots/`, `traces/`.

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

## Develop this package

```bash
npm install
npx playwright install chromium
npm test
npm run test:integration
npm run build
node dist/cli.js --config perf.config.example.json
```

- **`npm test`** — Vitest unit tests (stats, endpoint matching, config parsing, endpoint budgets).
- **`npm run test:integration`** — One Playwright run against a local HTTP server (requires Chromium installed).

## License

ISC — see [LICENSE](./LICENSE).
