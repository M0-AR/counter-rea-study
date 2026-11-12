#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const BLA = join(ROOT, "upstream", "bla");
const REA = join(ROOT, "upstream", "rea");
const SRC = join(ROOT, "fixtures", "src");
const OUT = join(ROOT, "results", "intensity");
const PROT = join(ROOT, "fixtures", "intensity");
const NODE = process.env.NODE_BIN ? [process.env.NODE_BIN] : ["npx", "-y", "node@24.22.1"];
const WABT = process.env.REA_WABT_BIN_DIRECTORY ?? "/tmp/opencode/wabt/bin";
const intensities = ["stealth", "balanced", "maximum", "bankrupt"];

const run = (cmd, args, opts = {}) => {
  const res = spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...opts });
  return { exit: res.status, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
};

const tokenCount = (args, env = {}) => {
  const out = run(NODE[0], [...NODE.slice(1), "scripts/rea.mjs", ...args, "--format", "json", "--token-count"], {
    cwd: REA,
    env: { ...process.env, REA_WABT_BIN_DIRECTORY: WABT, ...env },
  });
  const text = out.stdout.trim();
  return { exit: out.exit, tokens: /^\d+$/.test(text.split(/\s+/).at(-1)) ? Number(text.split(/\s+/).at(-1)) : null, stderr: out.stderr.slice(-1000) };
};

const treeBytes = (path) => {
  const st = statSync(path);
  if (!st.isDirectory()) return st.size;
  return readdirSync(path).reduce((sum, name) => sum + treeBytes(join(path, name)), 0);
};

const nodeCheck = (code) => {
  const out = run(NODE[0], [...NODE.slice(1), "-e", code]);
  try { return { exit: out.exit, parsed: JSON.parse(out.stdout) }; }
  catch { return { exit: out.exit, stdout: out.stdout, stderr: out.stderr }; }
};

rmSync(PROT, { recursive: true, force: true });
rmSync(OUT, { recursive: true, force: true });
mkdirSync(PROT, { recursive: true });
mkdirSync(OUT, { recursive: true });

const baseline = {
  js: tokenCount(["analyze-javascript-application", join(SRC, "app")]),
  wasm: tokenCount(["inspect-wasm-artifact", join(SRC, "module.wasm")]),
};

const js = {};
const wasm = {};
for (const intensity of intensities) {
  const jsDir = join(PROT, `js-${intensity}`);
  mkdirSync(jsDir, { recursive: true });
  copyFileSync(join(SRC, "app", "package.json"), join(jsDir, "package.json"));
  const jsProtect = run(NODE[0], [...NODE.slice(1), "dist/cli.js", "protect", join(SRC, "app"), "-o", join(jsDir, "license.js"), "--intensity", intensity, "--seed", `counter-rea-js-${intensity}-v1`, "--json"], { cwd: BLA });
  if (jsProtect.exit !== 0) throw new Error(`JS ${intensity} protect failed: ${jsProtect.stderr.slice(-1000)}`);
  const jsTok = tokenCount(["analyze-javascript-application", jsDir]);
  const jsCheck = nodeCheck(`
    const a = require(${JSON.stringify(join(SRC, "app", "license.js"))});
    const b = require(${JSON.stringify(join(jsDir, "license.js"))});
    const vectors = [["ENT-ABC","prod",123],["ENT-XYZ","prod",0],["BAD","prod",1],["ENT-","prod",4294967295]];
    const out = vectors.map((v) => [a.validateLicense(...v), b.validateLicense(...v)]);
    const lease = [a.issueLease("acct_1",30), b.issueLease("acct_1",30)];
    const same = out.every(([x,y]) => JSON.stringify(x) === JSON.stringify(y)) && JSON.stringify(lease[0]) === JSON.stringify(lease[1]);
    console.log(JSON.stringify({ same, out, lease }));
  `);
  js[intensity] = {
    tokens: jsTok.tokens,
    ratio: baseline.js.tokens && jsTok.tokens ? Number((jsTok.tokens / baseline.js.tokens).toFixed(2)) : null,
    functional: Boolean(jsCheck.parsed?.same),
    bytes: treeBytes(jsDir),
  };

  const wasmPath = join(PROT, `module-${intensity}.wasm`);
  const wasmProtect = run(NODE[0], [...NODE.slice(1), "dist/cli.js", "protect", join(SRC, "module.wasm"), "-o", wasmPath, "--intensity", intensity, "--seed", `counter-rea-wasm-${intensity}-v1`, "--wasm-preserve-exports", "computeDigest", "--json"], { cwd: BLA });
  if (wasmProtect.exit !== 0) throw new Error(`WASM ${intensity} protect failed: ${wasmProtect.stderr.slice(-1000)}`);
  const wasmTok = tokenCount(["inspect-wasm-artifact", wasmPath]);
  const wasmCheck = nodeCheck(`
    (async () => {
      const fs = require("node:fs");
      const a = await WebAssembly.instantiate(fs.readFileSync(${JSON.stringify(join(SRC, "module.wasm"))}));
      const b = await WebAssembly.instantiate(fs.readFileSync(${JSON.stringify(wasmPath)}));
      const exports = Object.keys(b.instance.exports);
      const out = [[1,2],[0xffffffff,0x12345678],[0,0]].map(([x,y]) => [a.instance.exports.computeDigest(x,y), b.instance.exports.computeDigest(x,y)]);
      console.log(JSON.stringify({ hasComputeDigest: exports.includes("computeDigest"), exportCount: exports.length, out, same: out.every(([x,y]) => x === y) }));
    })();
  `);
  wasm[intensity] = {
    tokens: wasmTok.tokens,
    ratio: baseline.wasm.tokens && wasmTok.tokens ? Number((wasmTok.tokens / baseline.wasm.tokens).toFixed(2)) : null,
    functional: Boolean(wasmCheck.parsed?.same),
    compute_digest: wasmCheck.parsed?.out?.[0]?.[1] ?? null,
    export_count: wasmCheck.parsed?.exportCount ?? null,
    bytes: readFileSync(wasmPath).length,
  };
}

const step = (values) => Number((values.bankrupt.tokens / values.maximum.tokens).toFixed(2));
const out = {
  generated_at: new Date().toISOString(),
  baseline: { js_tokens: baseline.js.tokens, wasm_tokens: baseline.wasm.tokens },
  js,
  wasm,
  bankrupt_step_multiple: { js: step(js), wasm: step(wasm) },
};
writeFileSync(join(ROOT, "results", "intensity_equivalence.json"), JSON.stringify(out, null, 2) + "\n");
console.log(JSON.stringify(out, null, 2));
