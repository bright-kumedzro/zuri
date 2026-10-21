// Builds the publishable package into dist/: bundled ES modules (three stays external), the mesher
// worker inlined as a string so it works in every bundler, and .d.ts types.

import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const dir = import.meta.dirname;
rmSync(`${dir}/dist`, { recursive: true, force: true });

// 1. The worker, as one self-contained classic script.
const worker = await build({
  entryPoints: [`${dir}/src/worker.ts`],
  bundle: true,
  format: "iife",
  target: "es2022",
  minify: true,
  write: false,
});
const workerCode = worker.outputFiles[0].text;

// 2. The library. src/spawn.ts is swapped for a version that starts the worker from a Blob URL.
const inlineWorker = {
  name: "inline-worker",
  setup(b) {
    b.onResolve({ filter: /[\\/]spawn\.ts$|^\.\/spawn\.ts$/ }, () => ({ path: "spawn", namespace: "zuri-inline" }));
    b.onLoad({ filter: /.*/, namespace: "zuri-inline" }, () => ({
      loader: "js",
      contents: `const code = ${JSON.stringify(workerCode)};
let url;
export const spawnWorker = () => new Worker(url ??= URL.createObjectURL(new Blob([code], { type: "text/javascript" })));`,
    }));
  },
};
await build({
  entryPoints: { index: `${dir}/src/index.ts`, flat: `${dir}/src/flat.ts`, params: `${dir}/src/params.ts` },
  outdir: `${dir}/dist`,
  bundle: true,
  splitting: true,
  format: "esm",
  target: "es2022",
  external: ["three", "three/*"],
  plugins: [inlineWorker],
  chunkNames: "chunks/[name]-[hash]",
  legalComments: "none",
});

// 3. Types.
const tsc = createRequire(import.meta.url).resolve("typescript/bin/tsc");
execFileSync(process.execPath, [tsc, "-p", `${dir}/tsconfig.build.json`], { stdio: "inherit" });
// tsc keeps the source's ".ts" specifiers in declarations; point them at the emitted ".js" names.
for (const f of readdirSync(`${dir}/dist/types`, { recursive: true })) {
  const file = `${dir}/dist/types/${f}`;
  if (!file.endsWith(".d.ts")) continue;
  writeFileSync(file, readFileSync(file, "utf8").replace(/((?:from\s+|import\()["']\.{1,2}\/[\w./-]+)\.ts(["'])/g, "$1.js$2"));
}
console.log(`built dist/ (worker ${(workerCode.length / 1024).toFixed(0)} KB inlined)`);
