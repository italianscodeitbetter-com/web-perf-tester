import type {
  EndpointRuleSummary,
  EndpointWatchRunStats,
  ParsedEndpointWatchRule,
  RunResult,
} from "./types.js";

function statsForRule(
  run: RunResult,
  ruleId: string,
): EndpointWatchRunStats | undefined {
  return run.endpointWatch.find((s) => s.id === ruleId);
}

export function evaluateEndpointRules(
  rules: ParsedEndpointWatchRule[],
  results: RunResult[],
): EndpointRuleSummary[] {
  return rules.map((rule) => {
    const failedRunsMaxCalls: number[] = [];
    const failedRunsMaxBytes: number[] = [];
    let maxCallCountInAnyRun = 0;
    let maxTotalBytesInAnyRun = 0;

    for (const run of results) {
      const st = statsForRule(run, rule.id);
      const callCount = st?.callCount ?? 0;
      const totalBytes = st?.totalResponseBytes ?? 0;
      maxCallCountInAnyRun = Math.max(maxCallCountInAnyRun, callCount);
      maxTotalBytesInAnyRun = Math.max(maxTotalBytesInAnyRun, totalBytes);

      if (
        rule.maxCalls !== undefined &&
        callCount > rule.maxCalls
      ) {
        failedRunsMaxCalls.push(run.run);
      }
      if (
        rule.maxTotalResponseBytes !== undefined &&
        totalBytes > rule.maxTotalResponseBytes
      ) {
        failedRunsMaxBytes.push(run.run);
      }
    }

    const passed =
      failedRunsMaxCalls.length === 0 && failedRunsMaxBytes.length === 0;

    return {
      id: rule.id,
      urlIncludes: rule.urlIncludes,
      urlRegex: rule.urlRegex,
      urlRegexFlags: rule.urlRegexFlags,
      method: rule.method,
      maxCalls: rule.maxCalls,
      maxTotalResponseBytes: rule.maxTotalResponseBytes,
      passed,
      maxCallCountInAnyRun,
      maxTotalBytesInAnyRun,
      failedRunsMaxCalls,
      failedRunsMaxBytes,
    };
  });
}
