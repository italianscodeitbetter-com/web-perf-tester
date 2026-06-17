import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  formatRunDateFolder,
  resolveRunOutputPaths,
} from "../src/output-paths.js";

describe("formatRunDateFolder", () => {
  it("formats local calendar date as YYYY-MM-DD", () => {
    const d = new Date(2026, 5, 17, 23, 59, 59);
    expect(formatRunDateFolder(d)).toBe("2026-06-17");
  });
});

describe("resolveRunOutputPaths", () => {
  it("places JSON and PDF under baseOutputDir/YYYY-MM-DD", () => {
    const d = new Date(2026, 0, 5);
    const paths = resolveRunOutputPaths("/tmp/.webperf", d);
    expect(paths.runOutputDir).toBe(path.join("/tmp/.webperf", "2026-01-05"));
    expect(paths.resultFile).toBe(
      path.join("/tmp/.webperf", "2026-01-05", "results.json"),
    );
    expect(paths.reportFile).toBe(
      path.join("/tmp/.webperf", "2026-01-05", "report.pdf"),
    );
  });
});
