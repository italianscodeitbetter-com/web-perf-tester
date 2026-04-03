import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import {
  ensureOptionalLocalStorageStub,
  parseInitArgs,
  runInit,
} from "../src/init-command.js";

const repoExample = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "perf.config.example.json",
);

let tmp: string | undefined;

afterEach(() => {
  if (tmp && fs.existsSync(tmp)) {
    fs.rmSync(tmp, { recursive: true, force: true });
    tmp = undefined;
  }
});

describe("parseInitArgs", () => {
  it("defaults dest and flags", () => {
    expect(parseInitArgs([])).toEqual({
      dest: "perf.config.json",
      force: false,
      skipBrowsers: false,
      help: false,
    });
  });

  it("parses positional dest", () => {
    expect(parseInitArgs(["./cfg/perf.json"])).toMatchObject({
      dest: "./cfg/perf.json",
      force: false,
      skipBrowsers: false,
      help: false,
    });
  });

  it("parses --force and --skip-browsers", () => {
    expect(parseInitArgs(["--force", "--skip-browsers"])).toMatchObject({
      dest: "perf.config.json",
      force: true,
      skipBrowsers: true,
      help: false,
    });
  });

  it("rejects unknown flags", () => {
    expect(() => parseInitArgs(["--nope"])).toThrow(/Unknown init option/);
  });

  it("rejects multiple positionals", () => {
    expect(() => parseInitArgs(["a.json", "b.json"])).toThrow(/at most one path/);
  });
});

describe("ensureOptionalLocalStorageStub", () => {
  it("creates missing localStorageState file as {}", () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "perf-init-"));
    const cfg = path.join(tmp, "perf.config.json");
    fs.writeFileSync(
      cfg,
      JSON.stringify({
        baseURL: "https://x.com",
        localStorageState: ".webperf/tokens.json",
        pages: [{ url: "/", maxReadyMs: 1 }],
      }),
      "utf8",
    );
    ensureOptionalLocalStorageStub(cfg);
    const tok = path.join(tmp, ".webperf", "tokens.json");
    expect(fs.readFileSync(tok, "utf8").trim()).toBe("{}");
  });

  it("does nothing when localStorageState is absent", () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "perf-init-"));
    const cfg = path.join(tmp, "perf.config.json");
    fs.writeFileSync(
      cfg,
      JSON.stringify({
        baseURL: "https://x.com",
        pages: [{ url: "/", maxReadyMs: 1 }],
      }),
      "utf8",
    );
    ensureOptionalLocalStorageStub(cfg);
    expect(fs.readdirSync(tmp)).toEqual(["perf.config.json"]);
  });
});

describe("runInit", () => {
  it("copies example and loadConfig succeeds with stub", async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "perf-init-"));
    const dest = path.join(tmp, "perf.config.json");
    await runInit({
      dest,
      skipBrowsers: true,
      cwd: tmp,
      exampleSourcePath: repoExample,
    });
    expect(fs.existsSync(dest)).toBe(true);
    const ls = path.join(tmp, ".webperf", "auth-tokens.json");
    expect(fs.existsSync(ls)).toBe(true);
    const c = loadConfig(dest);
    expect(c.baseURL).toBe("https://app.example.com");
    expect(c.localStorageState).toBe(ls);
  });

  it("refuses overwrite without --force", async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "perf-init-"));
    const dest = path.join(tmp, "perf.config.json");
    fs.writeFileSync(dest, "{}", "utf8");
    await expect(
      runInit({
        dest,
        skipBrowsers: true,
        cwd: tmp,
        exampleSourcePath: repoExample,
      }),
    ).rejects.toThrow(/Refusing to overwrite/);
  });

  it("overwrites with force", async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "perf-init-"));
    const dest = path.join(tmp, "perf.config.json");
    fs.writeFileSync(dest, "{}", "utf8");
    await runInit({
      dest,
      force: true,
      skipBrowsers: true,
      cwd: tmp,
      exampleSourcePath: repoExample,
    });
    const raw = fs.readFileSync(dest, "utf8");
    expect(raw).toContain("app.example.com");
  });
});
