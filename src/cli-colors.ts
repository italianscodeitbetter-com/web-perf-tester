import process from "node:process";

const ansi = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
} as const;

let cachedEnabled: boolean | undefined;

function ansiEnabled(): boolean {
  if (cachedEnabled !== undefined) return cachedEnabled;
  if (process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== "") {
    cachedEnabled = false;
    return false;
  }
  if (process.env.FORCE_COLOR === "1" || process.env.FORCE_COLOR === "true") {
    cachedEnabled = true;
    return true;
  }
  cachedEnabled = process.stdout.isTTY === true;
  return cachedEnabled;
}

export function colorPass(text: string): string {
  if (!ansiEnabled()) return text;
  return `${ansi.green}${text}${ansi.reset}`;
}

export function colorFail(text: string): string {
  if (!ansiEnabled()) return text;
  return `${ansi.red}${text}${ansi.reset}`;
}
