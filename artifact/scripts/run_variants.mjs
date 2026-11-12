#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const REA = join(ROOT, "upstream", "rea");
const PROT = join(ROOT, "fixtures", "protected");
const SRC = join(ROOT, "fixtures", "src");
const OUT = join(ROOT, "results", "variants");
const RAW = join(OUT, "raw");
const BLA = join(ROOT, "upstream", "bla");
const WASM_PRESERVE = join(PROT, "module.preserve.wasm");
const NODE = process.env.NODE_BIN ? [process.env.NODE_BIN] : ["npx", "-y", "node@24.22.1"];
const WABT = process.env.REA_WABT_BIN_DIRECTORY ?? "/tmp/opencode/wabt/bin";

const variants = [
  { id: "wasm-default", path: join(PROT, "module.wasm"), rea: "inspect-wasm-artifact", env: { REA_WABT_BIN_DIRECTORY: WABT }, note: "default bankrupt output; public ABI is renamed" },
  { id: "wasm-fixed", path: WASM_PRESERVE, rea: "inspect-wasm-artifact", env: { REA_WABT_BIN_DIRECTORY: WABT }, note: "bankrupt with computeDigest preserved" },
  { id: "wasm-baseline-fixed", path: join(SRC, "module.wasm"), rea: "inspect-wasm-artifact", env: { REA_WABT_BIN_DIRECTORY: WABT }, note: "unprotected control" },
  { id: "asar-raised-32m", path: join(PROT, "app.asar"), rea: "analyze-javascript-application", env: { REA_ASAR_MAX_HEADER_BYTES: "33554432" }, note: "documented ASAR override" },
  { id: "beam-chunks-20000", path: join(PROT, "guard.beam"), rea: "inspect-erlang-beam", args: ["--max-chunks", "20000", "--max-atoms", "20000"], note: "raised caller-selected budget" },
  { id: "beam-baseline-20000", path: join(SRC, "guard.beam"), rea: "inspect-erlang-beam", args: ["--max-chunks", "20000", "--max-atoms", "20000"], note: "unprotected control" },
  { id: "pcap-fields", path: join(PROT, "traffic.pcap"), rea: "inspect-packet-capture", args: ["--fields", "frame.number"], note: "TShark precondition" },
];

const run = (cmd, args, opts = {}) => {
  const started = process.hrtime.bigint();
  const res = spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...opts });
  return { exit: res.status, signal: res.signal, wall_ms: Math.round(Number(process.hrtime.bigint() - started) / 1e6), stdout: res.stdout ?? "", stderr: res.stderr ?? "", error: res.error ? String(res.error) : null };
};

const timed = (cmd, args, cwd, outPath, timePath, env) => {
  const fd = openSync(outPath, "w");
  const errFd = openSync(outPath + ".stderr", "w");
  const res = run("/usr/bin/time", ["-f", "%e %M", "-o", timePath, ...cmd, ...args], { cwd, env: { ...process.env, ...env }, stdio: ["ignore", fd, errFd] });
  closeSync(fd);
  closeSync(errFd);
  const timing = existsSync(timePath) ? readFileSync(timePath, "utf8").trim().split(/\s+/) : [];
  return {
    ...res,
    bytes: existsSync(outPath) ? readFileSync(outPath).length : 0,
    stderr: existsSync(outPath + ".stderr") ? readFileSync(outPath + ".stderr", "utf8") : "",
    wall_s: Number(timing[0]),
    maxrss_kb: Number(timing[1]),
  };
};

const jsonOf = (path) => { try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; } };

rmSync(RAW, { recursive: true, force: true });
mkdirSync(RAW, { recursive: true });

const protectWasm = run(NODE[0], [...NODE.slice(1), "dist/cli.js", "protect", join(SRC, "module.wasm"), "-o", WASM_PRESERVE, "--intensity", "bankrupt", "--seed", "counter-rea-wasm-preserve-v1", "--wasm-preserve-exports", "computeDigest", "--json"], { cwd: BLA });
if (protectWasm.exit !== 0) {
  throw new Error(`preserve-exports protection failed: ${protectWasm.stderr.slice(-1000)}`);
}
const results = [];

for (const v of variants) {
  const dir = join(RAW, v.id);
  mkdirSync(dir, { recursive: true });
  const args = [v.rea, v.path, ...(v.args ?? []), "--format", "json"];
  const full = timed(NODE, ["scripts/rea.mjs", ...args, "--timings"], REA, join(dir, "rea.full.json"), join(dir, "rea.full.time"), v.env);
  const j = jsonOf(join(dir, "rea.full.json"));
  const tok = timed(NODE, ["scripts/rea.mjs", ...args, "--token-count"], REA, join(dir, "rea.tokens.txt"), join(dir, "rea.tokens.time"), v.env);
  const tokenText = readFileSync(join(dir, "rea.tokens.txt"), "utf8").trim();
  const entry = {
    id: v.id,
    note: v.note,
    path: v.path,
    rea_full: { exit: full.exit, wall_s: full.wall_s, maxrss_kb: full.maxrss_kb, bytes: full.bytes, stderr: full.stderr.slice(-3000), confidence: j?.confidence ?? null, limitations: j?.limitations ?? [], statistics: j?.normalized_result?.statistics ?? null, semantic: j?.normalized_result?.semantic_graph ? { nodes: j.normalized_result.semantic_graph.nodes?.length ?? null, relations: j.normalized_result.semantic_graph.relations?.length ?? null, unknowns: j.normalized_result.semantic_graph.unknowns?.length ?? null } : null, error: j?.error ?? null, code: j?.code ?? null, message: j?.message ?? null },
    rea_tokens: { exit: tok.exit, wall_s: tok.wall_s, maxrss_kb: tok.maxrss_kb, value: /^\d+$/.test(tokenText) ? Number(tokenText) : tokenText, stderr: tok.stderr.slice(-3000) },
  };
  results.push(entry);
  console.log(JSON.stringify({ id: v.id, rea_exit: entry.rea_full.exit, rea_bytes: entry.rea_full.bytes, rea_tokens: entry.rea_tokens.value, code: entry.rea_full.code ?? null }));
}

writeFileSync(join(OUT, "variants.json"), JSON.stringify({ generated_at: new Date().toISOString(), variants: results }, null, 2));
console.log(JSON.stringify({ ok: true, out: join(OUT, "variants.json") }));
