import { describe, expect, it } from "vitest";
import { percentile } from "../src/stats.js";

describe("percentile", () => {
  it("returns 0 for empty", () => {
    expect(percentile([], 50)).toBe(0);
  });

  it("returns single value", () => {
    expect(percentile([42], 50)).toBe(42);
    expect(percentile([42], 95)).toBe(42);
  });

  it("interpolates for p50 on two values", () => {
    expect(percentile([10, 20], 50)).toBe(15);
  });

  it("matches p95 on sorted array", () => {
    const v = [1, 2, 3, 4, 100].sort((a, b) => a - b);
    const p95 = percentile(v, 95);
    expect(p95).toBeGreaterThan(4);
    expect(p95).toBeLessThanOrEqual(100);
  });
});
