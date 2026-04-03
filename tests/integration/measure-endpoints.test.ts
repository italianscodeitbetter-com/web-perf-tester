import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { compileEndpointWatchRules } from "../../src/config.js";
import { measureRun } from "../../src/runner.js";

describe("measureRun endpointWatch (integration)", () => {
  let baseURL: string;
  let server: http.Server;
  let tmp: string;

  beforeAll(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "perf-int-"));
    const trackBody = JSON.stringify({ ok: true });
    server = http.createServer((req, res) => {
      if (req.url?.startsWith("/api/track")) {
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Content-Length": String(Buffer.byteLength(trackBody)),
        });
        res.end(trackBody);
        return;
      }
      if (req.url === "/late" || req.url?.startsWith("/late?")) {
        const html = `<!DOCTYPE html><html><body><script>
const el = document.createElement('div');
el.setAttribute('data-ready', '');
el.textContent = 'ready';
document.body.appendChild(el);
setTimeout(() => { void fetch('/api/track'); }, 200);
</script></body></html>`;
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(html);
        return;
      }
      if (req.url === "/" || req.url?.startsWith("/?")) {
        const html = `<!DOCTYPE html><html><body><script>
(async () => {
  for (let i = 0; i < 3; i++) {
    await fetch('/api/track');
  }
  const el = document.createElement('div');
  el.setAttribute('data-ready', '');
  el.textContent = 'ready';
  document.body.appendChild(el);
})();
</script></body></html>`;
        res.writeHead(200, { "Content-Type": "text/html" });
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
    if (!addr || typeof addr === "string") {
      throw new Error("no server address");
    }
    baseURL = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("counts matching API responses and sums sizes", async () => {
    const rules = compileEndpointWatchRules([
      { id: "track", urlIncludes: "/api/track", method: "GET" },
    ]);
    const traceDir = path.join(tmp, "traces");
    const screenshotDir = path.join(tmp, "shots");
    const result = await measureRun({
      run: 1,
      baseURL,
      gotoURL: "/",
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
      filePrefix: "int",
      endpointWatch: rules,
    });

    const w = result.endpointWatch.find((e) => e.id === "track");
    expect(w).toBeDefined();
    expect(w!.callCount).toBe(3);
    const expectedBytes = 3 * Buffer.byteLength(JSON.stringify({ ok: true }));
    expect(w!.totalResponseBytes).toBe(expectedBytes);
  });

  it("waitForResponse waits for API after UI ready", async () => {
    const rules = compileEndpointWatchRules([
      {
        id: "track",
        urlIncludes: "/api/track",
        method: "GET",
        waitForResponse: true,
      },
    ]);
    const traceDir = path.join(tmp, "traces-late");
    const screenshotDir = path.join(tmp, "shots-late");
    const result = await measureRun({
      run: 1,
      baseURL,
      gotoURL: "/late",
      headless: true,
      readyVisible: "[data-ready]",
      readyHidden: "[data-test=noop]",
      skipReadyHidden: true,
      navigationTimeoutMs: 30_000,
      readyTimeoutMs: 30_000,
      readyHiddenTimeoutMs: 5000,
      waitForEndpointsTimeoutMs: 10_000,
      traceDir,
      screenshotDir,
      filePrefix: "late",
      endpointWatch: rules,
    });

    const w = result.endpointWatch.find((e) => e.id === "track");
    expect(w?.callCount).toBe(1);
  });
});
