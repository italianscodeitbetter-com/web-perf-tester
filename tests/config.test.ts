import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  compileEndpointWatchRules,
  loadConfig,
  mergeEndpointWatch,
} from "../src/config.js";
import type { PerfDefaults, PerfPageConfig } from "../src/types.js";

let tmpDir: string | undefined;

afterEach(() => {
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = undefined;
  }
});

function writeConfig(name: string, json: unknown) {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "perf-cfg-"));
  const p = path.join(tmpDir, name);
  fs.writeFileSync(p, JSON.stringify(json), "utf8");
  return p;
}

const minimalPage: PerfPageConfig = {
  url: "/",
  maxReadyMs: 1000,
};

describe("loadConfig endpointWatch", () => {
  it("accepts urlIncludes rule", () => {
    const p = writeConfig("c.json", {
      baseURL: "https://a.com",
      pages: [minimalPage],
      defaults: {
        endpointWatch: [
          { id: "x", urlIncludes: "/api", method: "GET", maxCalls: 1 },
        ],
      },
    });
    const c = loadConfig(p);
    expect(c.defaults?.endpointWatch?.[0]?.urlIncludes).toBe("/api");
  });

  it("accepts urlRegex with flags", () => {
    const p = writeConfig("c.json", {
      baseURL: "https://a.com",
      pages: [
        {
          ...minimalPage,
          endpointWatch: [
            {
              id: "r",
              urlRegex: "^https://",
              urlRegexFlags: "i",
            },
          ],
        },
      ],
    });
    const c = loadConfig(p);
    const rules = mergeEndpointWatch(c.defaults, c.pages[0]!);
    expect(rules[0]!.compiledRegex?.test("https://a.com/x")).toBe(true);
  });

  it("rejects both urlIncludes and urlRegex", () => {
    const p = writeConfig("c.json", {
      baseURL: "https://a.com",
      pages: [minimalPage],
      defaults: {
        endpointWatch: [
          { id: "bad", urlIncludes: "/a", urlRegex: ".*" },
        ],
      },
    });
    expect(() => loadConfig(p)).toThrow(/exactly one of/);
  });

  it("rejects invalid regex", () => {
    const p = writeConfig("c.json", {
      baseURL: "https://a.com",
      pages: [minimalPage],
      defaults: {
        endpointWatch: [{ id: "bad", urlRegex: "(" }],
      },
    });
    expect(() => loadConfig(p)).toThrow(/invalid urlRegex/);
  });
});

describe("mergeEndpointWatch", () => {
  const defaults: PerfDefaults = {
    endpointWatch: [
      { id: "d", urlIncludes: "/d", method: "GET" },
    ],
  };

  it("uses page rules when page.endpointWatch is defined", () => {
    const page: PerfPageConfig = {
      ...minimalPage,
      endpointWatch: [{ id: "p", urlIncludes: "/p", method: "GET" }],
    };
    const m = mergeEndpointWatch(defaults, page);
    expect(m).toHaveLength(1);
    expect(m[0]!.id).toBe("p");
  });

  it("uses defaults when page has no endpointWatch", () => {
    const m = mergeEndpointWatch(defaults, minimalPage);
    expect(m).toHaveLength(1);
    expect(m[0]!.id).toBe("d");
  });

  it("uses empty page list when page sets endpointWatch to []", () => {
    const page: PerfPageConfig = {
      ...minimalPage,
      endpointWatch: [],
    };
    const m = mergeEndpointWatch(defaults, page);
    expect(m).toHaveLength(0);
  });
});

describe("loadConfig localStorageState", () => {
  it("resolves path relative to config file directory", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "perf-cfg-"));
    const sub = path.join(tmpDir, "secrets");
    fs.mkdirSync(sub, { recursive: true });
    const lsPath = path.join(sub, "tokens.json");
    fs.writeFileSync(lsPath, JSON.stringify({ k: "v" }), "utf8");
    const cfgPath = path.join(tmpDir, "perf.json");
    fs.writeFileSync(
      cfgPath,
      JSON.stringify({
        baseURL: "https://app.example.com",
        localStorageState: "secrets/tokens.json",
        pages: [minimalPage],
      }),
      "utf8",
    );
    const c = loadConfig(cfgPath);
    expect(c.localStorageState).toBe(lsPath);
  });

  it("throws when localStorageState file is missing", () => {
    const p = writeConfig("c.json", {
      baseURL: "https://a.com",
      localStorageState: "missing.json",
      pages: [minimalPage],
    });
    expect(() => loadConfig(p)).toThrow(/localStorageState file not found/);
  });

  it("omits localStorageState when not set", () => {
    const p = writeConfig("c.json", {
      baseURL: "https://a.com",
      pages: [minimalPage],
    });
    const c = loadConfig(p);
    expect(c.localStorageState).toBeUndefined();
  });
});

describe("compileEndpointWatchRules", () => {
  it("compiles regex rules", () => {
    const r = compileEndpointWatchRules([
      { id: "a", urlRegex: "foo", method: "GET" },
    ]);
    expect(r[0]!.compiledRegex?.test("foo")).toBe(true);
  });
});
