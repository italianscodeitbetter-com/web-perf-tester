import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium } from "playwright";
import { applyLocalStorageInitScript } from "../../src/local-storage-inject.js";

describe("localStorage injection (integration)", () => {
  let baseURL: string;
  let server: http.Server;
  let tmp: string;

  beforeAll(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "perf-ls-int-"));
    server = http.createServer((req, res) => {
      const pathOnly = req.url?.split("?")[0] ?? "";
      if (pathOnly === "/" || pathOnly === "") {
        const html = `<!DOCTYPE html><html><body><script>
const marker = document.createElement('div');
marker.setAttribute('data-ready','');
marker.setAttribute('data-ls-token', localStorage.getItem('integrationToken') || '');
marker.setAttribute('data-ls-empty', localStorage.getItem('emptyKey') || '');
document.body.appendChild(marker);
</script></body></html>`;
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
        return;
      }
      if (pathOnly === "/measure-run") {
        const html = `<!DOCTYPE html><html><body><script>
if (localStorage.getItem('measureRunKey') === 'measure-run-ok') {
  const el = document.createElement('div');
  el.setAttribute('data-ready', '');
  el.textContent = 'ready';
  document.body.appendChild(el);
}
</script></body></html>`;
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
        return;
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("no address");
    baseURL = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("injects flat JSON into localStorage before page scripts run", async () => {
    const lsFile = path.join(tmp, "auth.json");
    fs.writeFileSync(
      lsFile,
      JSON.stringify({
        integrationToken: "hello-from-config",
        emptyKey: "",
      }),
      "utf8",
    );

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ baseURL });
    await applyLocalStorageInitScript(context, lsFile);
    const page = await context.newPage();
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const token = await page.locator("[data-ready]").getAttribute("data-ls-token");
    const empty = await page.locator("[data-ready]").getAttribute("data-ls-empty");

    expect(token).toBe("hello-from-config");
    expect(empty).toBe("");

    await browser.close();
  });

  it("measureRun applies localStorageState before page scripts (ready selector)", async () => {
    const lsFile = path.join(tmp, "auth2.json");
    fs.writeFileSync(
      lsFile,
      JSON.stringify({ measureRunKey: "measure-run-ok" }),
      "utf8",
    );

    const { measureRun } = await import("../../src/runner.js");
    const traceDir = path.join(tmp, "tr2");
    const screenshotDir = path.join(tmp, "sh2");

    const result = await measureRun({
      run: 1,
      baseURL,
      gotoURL: "/measure-run",
      localStorageState: lsFile,
      headless: true,
      readyVisible: "[data-ready]",
      readyHidden: "[data-test=noop]",
      skipReadyHidden: true,
      navigationTimeoutMs: 30_000,
      readyTimeoutMs: 30_000,
      readyHiddenTimeoutMs: 5000,
      waitForEndpointsTimeoutMs: 30_000,
      traceDir,
      screenshotDir,
      filePrefix: "ls",
    });

    expect(result.url).toBe("/measure-run");
    expect(result.readyMs).toBeGreaterThanOrEqual(0);
  });
});
