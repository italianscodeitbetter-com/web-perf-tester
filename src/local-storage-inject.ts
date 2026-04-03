import fs from "node:fs";

/**
 * Load a flat JSON object `{ "key": "value", ... }` for injection into
 * `localStorage` via Playwright `addInitScript`.
 */
export function loadLocalStoragePairsFromFile(absPath: string): Record<string, string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(absPath, "utf8"));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`localStorageState file not valid JSON (${absPath}): ${msg}`);
  }
  if (
    parsed === null ||
    typeof parsed !== "object" ||
    Array.isArray(parsed)
  ) {
    throw new Error(
      `localStorageState must be a JSON object with string keys at ${absPath}`,
    );
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
    else if (v === null || v === undefined) out[k] = "";
    else if (typeof v === "boolean" || typeof v === "number") out[k] = String(v);
    else out[k] = JSON.stringify(v);
  }
  return out;
}

/** Playwright context shape used for init scripts. */
type AddInitScriptContext = {
  addInitScript: (
    pageFunction: (storage: Record<string, string>) => void,
    arg: Record<string, string>,
  ) => Promise<unknown>;
};

/**
 * Register init script so each document load applies `localStorage.setItem` for all pairs
 * from the JSON file at `absPath`. Call after `browser.newContext()`, before navigation.
 */
export async function applyLocalStorageInitScript(
  context: AddInitScriptContext,
  absPath: string,
): Promise<void> {
  const pairs = loadLocalStoragePairsFromFile(absPath);
  await context.addInitScript(
    (storage: Record<string, string>) => {
      for (const [key, val] of Object.entries(storage)) {
        try {
          window.localStorage.setItem(key, val);
        } catch {
          /* opaque origin, etc. */
        }
      }
    },
    pairs,
  );
}
