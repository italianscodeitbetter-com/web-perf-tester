import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type RunInitOptions = {
  /** Absolute or cwd-relative path for the new config file */
  dest: string;
  /** Overwrite `dest` if it already exists */
  force?: boolean;
  /** Do not run `npx playwright install chromium` */
  skipBrowsers?: boolean;
  /** Working directory for browser install (default `process.cwd()`) */
  cwd?: string;
  /** Test hook: path to example JSON (default: package `perf.config.example.json`) */
  exampleSourcePath?: string;
};

function packageRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..");
}

function defaultExamplePath(): string {
  return path.join(packageRoot(), "perf.config.example.json");
}

/**
 * If the copied config references `localStorageState` and that file is missing,
 * create parent dirs and write `{}` so `loadConfig` succeeds (flat JSON is valid).
 */
export function ensureOptionalLocalStorageStub(configAbsPath: string): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(configAbsPath, "utf8"));
  } catch {
    return;
  }
  if (
    parsed === null ||
    typeof parsed !== "object" ||
    Array.isArray(parsed) ||
    typeof (parsed as { localStorageState?: unknown }).localStorageState !==
      "string"
  ) {
    return;
  }
  const rel = (parsed as { localStorageState: string }).localStorageState;
  const dir = path.dirname(path.resolve(configAbsPath));
  const abs = path.resolve(dir, rel);
  if (fs.existsSync(abs)) return;
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, "{}\n", "utf8");
}

const GITIGNORE_MARKER = "# @icib.dev/perf-web-tester artifacts";

/** Normalize `outputDir` for a `.gitignore` line (trailing slash). */
export function normalizeGitignoreOutputDir(outputDir: string): string {
  const trimmed = (outputDir.trim() || ".webperf").replace(/\/+$/, "");
  return `${trimmed}/`;
}

function gitignoreAlreadyHasOutputDir(
  content: string,
  outputDirLine: string,
): boolean {
  const bare = outputDirLine.replace(/\/$/, "");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (trimmed === outputDirLine || trimmed === bare) return true;
  }
  return false;
}

/**
 * Append `outputDir` to `.gitignore` in `cwd` when not already ignored.
 * Returns whether the file was created or updated.
 */
export function ensureGitignoreOutputDir(
  cwd: string,
  outputDir: string,
): { updated: boolean; line: string } {
  const line = normalizeGitignoreOutputDir(outputDir);
  const gitignorePath = path.join(cwd, ".gitignore");
  const existing = fs.existsSync(gitignorePath)
    ? fs.readFileSync(gitignorePath, "utf8")
    : "";

  if (gitignoreAlreadyHasOutputDir(existing, line)) {
    return { updated: false, line };
  }

  const block = existing.length === 0
    ? `${GITIGNORE_MARKER}\n${line}\n`
    : `${existing.endsWith("\n") ? existing : `${existing}\n`}\n${GITIGNORE_MARKER}\n${line}\n`;
  fs.writeFileSync(gitignorePath, block, "utf8");
  return { updated: true, line };
}

function readOutputDirFromConfig(configAbsPath: string): string {
  try {
    const parsed = JSON.parse(fs.readFileSync(configAbsPath, "utf8")) as {
      outputDir?: unknown;
    };
    if (typeof parsed.outputDir === "string" && parsed.outputDir.trim()) {
      return parsed.outputDir;
    }
  } catch {
    // ignore
  }
  return ".webperf";
}

export function parseInitArgs(argv: string[]): {
  dest: string;
  force: boolean;
  skipBrowsers: boolean;
  help: boolean;
} {
  let dest = "perf.config.json";
  let force = false;
  let skipBrowsers = false;
  let help = false;

  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--help" || a === "-h") {
      help = true;
    } else if (a === "--force" || a === "-f") {
      force = true;
    } else if (a === "--skip-browsers") {
      skipBrowsers = true;
    } else if (!a.startsWith("-")) {
      positional.push(a);
    } else {
      throw new Error(`Unknown init option: ${a}`);
    }
  }
  if (positional.length > 1) {
    throw new Error("init accepts at most one path (output config file)");
  }
  if (positional[0]) dest = positional[0]!;

  return { dest, force, skipBrowsers, help };
}

export function printInitHelp(): void {
  console.log(`@icib.dev/perf-web-tester init — copy example config and install Chromium

Usage:
  icib-perf-web-tester init [options] [dest]

Arguments:
  dest                 Output config path (default: perf.config.json)

Options:
  -f, --force          Overwrite dest if it already exists
      --skip-browsers  Do not run npx playwright install chromium
  -h, --help           Show this message

Copies the package example perf.config.example.json into your project. If the
example lists localStorageState and that file is missing, an empty {} JSON file
is created next to the config so loadConfig succeeds. Adds outputDir to
.gitignore when not already present.

Requires a network fetch the first time you install Playwright browsers unless
you pass --skip-browsers.
`);
}

/**
 * Run `npx playwright install chromium` from cwd; resolves with exit code.
 */
export function installPlaywrightBrowsers(cwd: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "npx",
      ["--yes", "playwright", "install", "chromium"],
      {
        stdio: "inherit",
        cwd,
        shell: process.platform === "win32",
        env: process.env,
      },
    );
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });
}

export async function runInit(options: RunInitOptions): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const destAbs = path.resolve(cwd, options.dest);
  const examplePath = options.exampleSourcePath ?? defaultExamplePath();

  if (!fs.existsSync(examplePath)) {
    throw new Error(
      `Example config not found at ${examplePath} (is the package installed correctly?)`,
    );
  }

  if (fs.existsSync(destAbs) && !options.force) {
    throw new Error(
      `Refusing to overwrite ${destAbs} (use --force to replace it)`,
    );
  }

  fs.mkdirSync(path.dirname(destAbs), { recursive: true });
  fs.copyFileSync(examplePath, destAbs);
  ensureOptionalLocalStorageStub(destAbs);

  console.log(`Wrote ${destAbs}`);

  const outputDir = readOutputDirFromConfig(destAbs);
  const gitignore = ensureGitignoreOutputDir(cwd, outputDir);
  if (gitignore.updated) {
    console.log(`Updated .gitignore (added ${gitignore.line})`);
  } else {
    console.log(`Skipped .gitignore (already ignores ${gitignore.line})`);
  }

  if (options.skipBrowsers) {
    console.log("Skipped Playwright browser install (--skip-browsers).");
    return;
  }

  console.log("Installing Chromium for Playwright (npx playwright install chromium)…");
  const code = await installPlaywrightBrowsers(cwd);
  if (code !== 0) {
    throw new Error(
      `playwright install chromium exited with code ${code}. Install the playwright npm package in this project (npm install -D playwright) and retry, or run with --skip-browsers.`,
    );
  }
  console.log("Chromium install finished.");
}
