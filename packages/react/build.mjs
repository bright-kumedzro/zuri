// dist/index.js via esbuild (keeps "use client"), dist/index.d.ts via tsc.
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { createRequire } from "node:module";

const dir = import.meta.dirname;
rmSync(`${dir}/dist`, { recursive: true, force: true });
await build({ entryPoints: [`${dir}/src/index.tsx`], outdir: `${dir}/dist`, format: "esm", target: "es2022", jsx: "automatic", bundle: false });
execFileSync(process.execPath, [createRequire(import.meta.url).resolve("typescript/bin/tsc"), "-p", `${dir}/tsconfig.build.json`], { stdio: "inherit" });
