import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  applyLocalStorageInitScript,
  loadLocalStoragePairsFromFile,
} from "../src/local-storage-inject.js";

let tmp: string | undefined;
afterEach(() => {
  if (tmp && fs.existsSync(tmp)) {
    fs.rmSync(tmp, { recursive: true, force: true });
    tmp = undefined;
  }
});

describe("loadLocalStoragePairsFromFile", () => {
  it("parses string values", () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ls-"));
    const p = path.join(tmp, "x.json");
    fs.writeFileSync(p, JSON.stringify({ a: "1", b: "two" }), "utf8");
    expect(loadLocalStoragePairsFromFile(p)).toEqual({ a: "1", b: "two" });
  });

  it("coerces numbers and booleans", () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ls-"));
    const p = path.join(tmp, "x.json");
    fs.writeFileSync(p, JSON.stringify({ n: 42, f: false }), "utf8");
    expect(loadLocalStoragePairsFromFile(p)).toEqual({ n: "42", f: "false" });
  });

  it("rejects arrays", () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ls-"));
    const p = path.join(tmp, "x.json");
    fs.writeFileSync(p, "[1,2]", "utf8");
    expect(() => loadLocalStoragePairsFromFile(p)).toThrow(/JSON object/);
  });

  it("maps null to empty string", () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ls-"));
    const p = path.join(tmp, "x.json");
    fs.writeFileSync(p, JSON.stringify({ k: null }), "utf8");
    expect(loadLocalStoragePairsFromFile(p)).toEqual({ k: "" });
  });
});

describe("applyLocalStorageInitScript", () => {
  it("passes file contents to addInitScript", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ls-"));
    const p = path.join(dir, "auth.json");
    fs.writeFileSync(
      p,
      JSON.stringify({ accessTokenAdmin: "tok", n: 7 }),
      "utf8",
    );
    let captured: Record<string, string> | undefined;
    const ctx = {
      addInitScript: async (
        _fn: (s: Record<string, string>) => void,
        arg: Record<string, string>,
      ) => {
        captured = arg;
      },
    };
    await applyLocalStorageInitScript(ctx, p);
    expect(captured).toEqual({ accessTokenAdmin: "tok", n: "7" });
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
