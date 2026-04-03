import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["esm"],
    dts: true,
    clean: true,
    outDir: "dist",
    sourcemap: true,
    platform: "node",
    target: "node18",
  },
  {
    entry: ["src/cli.ts"],
    format: ["esm"],
    dts: false,
    clean: false,
    outDir: "dist",
    sourcemap: true,
    platform: "node",
    target: "node18",
    banner: {
      js: "#!/usr/bin/env node",
    },
  },
  {
    entry: ["src/init-check.ts"],
    format: ["esm"],
    dts: false,
    clean: false,
    outDir: "dist",
    sourcemap: true,
    platform: "node",
    target: "node18",
    banner: {
      js: "#!/usr/bin/env node",
    },
  },
]);
