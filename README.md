# icib-perf-web-tester

Measure **time-to-ready** for web pages with [Playwright](https://playwright.dev): navigate, wait for a visible selector (and optionally a hidden loading selector), repeat over several runs, and compare against a **JSON-defined budget** for CI.

## Requirements

- Node.js 18+
- Chromium for Playwright: `npx playwright install chromium`

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

See [perf.config.example.json](./perf.config.example.json) for optional timeouts and per-page overrides.

### Interactive wizard

Add or append page checks by answering prompts (writes `perf.config.json` or merges into an existing file):

```bash
npx icib-perf-add-check
npx icib-perf-add-check --config ./config/perf.config.json
```

For a **new** file, it asks for `baseURL`, optional `storageState`, `runs`, `headless`, `outputDir`, `budgetMetric`, and optional shared **defaults** (selectors and timeouts). Then it walks you through each **page**: `url`, `maxReadyMs`, and optional per-page overrides. For an **existing** file, it only appends new `pages` entries (global settings stay as they are).

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

- **0** — Every page’s metric (`median` or `p95` per `budgetMetric`) is ≤ its `maxReadyMs`.
- **1** — Invalid config / missing files, or at least one page is over budget.

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
npm run build
node dist/cli.js --config perf.config.example.json
```

## License

ISC — see [LICENSE](./LICENSE).
