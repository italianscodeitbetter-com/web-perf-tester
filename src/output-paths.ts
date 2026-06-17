import path from "node:path";

/** Local calendar date as `YYYY-MM-DD` (for daily run output folders). */
export function formatRunDateFolder(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export type RunOutputPaths = {
  runOutputDir: string;
  resultFile: string;
  reportFile: string;
};

export function resolveRunOutputPaths(
  baseOutputDir: string,
  date: Date = new Date(),
): RunOutputPaths {
  const runOutputDir = path.join(baseOutputDir, formatRunDateFolder(date));
  return {
    runOutputDir,
    resultFile: path.join(runOutputDir, "results.json"),
    reportFile: path.join(runOutputDir, "report.pdf"),
  };
}
