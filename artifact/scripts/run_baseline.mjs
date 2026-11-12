#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const REA = join(ROOT, "upstream", "rea");
const SRC = join(ROOT, "fixtures", "src");
const OUT = join(ROOT, "results", "baseline");
const RAW = join(OUT, "raw");
const NODE = process.env.NODE_BIN ? [process.env.NODE_BIN] : ["npx", "-y", "node@24.22.1"];

const cases = [
  { id: "js-app", path: join(SRC, "app"), rea: "analyze-javascript-application" },
  { id: "asar", path: join(SRC, "app.asar"), rea: "analyze-javascript-application" },
  { id: "wasm", path: join(SRC, "module.wasm"), rea: "inspect-wasm-artifact", env: { REA_WABT_BIN_DIRECTORY: process.env.REA_WABT_BIN_DIRECTORY ?? "/tmp/opencode/wabt/bin" } },
  { id: "sqlite", path: join(SRC, "license.sqlite"), rea: "inspect-sqlite-database" },
  { id: "safetensors", path: join(SRC, "weights.safetensors"), rea: "inspect-model-artifact" },
  { id: "gguf", path: join(SRC, "model.gguf"), rea: "inspect-model-artifact" },
  { id: "beam", path: join(SRC, "guard.beam"), rea: "inspect-erlang-beam" },
  { id: "evm", path: join(SRC, "Vault.evm"), rea: "inspect-evm-interface", args: ["raw"] },
  { id: "pcap", path: join(SRC, "traffic.pcap"), rea: "inspect-packet-capture", args: ["--fields", "frame.number"] },
  { id: "ptx", path: join(SRC, "kernel.ptx"), rea: "inspect-gpu-code-objects" },
  { id: "elf", path: join(SRC, "native.elf"), rea: "inspect-native-exports" },
  { id: "pyc", path: join(SRC, "license.pyc"), rea: "inspect-python-pyc" },
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
const results = [];

for (const c of cases) {
  const dir = join(RAW, c.id);
  mkdirSync(dir, { recursive: true });
  const args = [c.rea, c.path, ...(c.args ?? []), "--format", "json"];
  const full = timed(NODE, ["scripts/rea.mjs", ...args, "--timings"], REA, join(dir, "rea.full.json"), join(dir, "rea.full.time"), c.env);
  const j = jsonOf(join(dir, "rea.full.json"));
  const tok = timed(NODE, ["scripts/rea.mjs", ...args, "--token-count"], REA, join(dir, "rea.tokens.txt"), join(dir, "rea.tokens.time"), c.env);
  const tokenText = readFileSync(join(dir, "rea.tokens.txt"), "utf8").trim();
  const entry = {
    id: c.id,
    path: c.path,
    input_bytes: existsSync(c.path) ? (c.path.endsWith(".asar") || c.path.endsWith(".wasm") || c.path.endsWith(".sqlite") || c.path.endsWith(".safetensors") || c.path.endsWith(".gguf") || c.path.endsWith(".beam") || c.path.endsWith(".evm") || c.path.endsWith(".pcap") || c.path.endsWith(".ptx") || c.path.endsWith(".elf") || c.path.endsWith(".pyc") ? readFileSync(c.path).length : null) : null,
    rea_full: { exit: full.exit, wall_s: full.wall_s, maxrss_kb: full.maxrss_kb, bytes: full.bytes, stderr: full.stderr.slice(-2000), confidence: j?.confidence ?? null, limitations: j?.limitations ?? [], statistics: j?.normalized_result?.statistics ?? null, semantic: j?.normalized_result?.semantic_graph ? { nodes: j.normalized_result.semantic_graph.nodes?.length ?? null, relations: j.normalized_result.semantic_graph.relations?.length ?? null, unknowns: j.normalized_result.semantic_graph.unknowns?.length ?? null } : null, error: j?.error ?? null, code: j?.code ?? null, message: j?.message ?? null },
    rea_tokens: { exit: tok.exit, wall_s: tok.wall_s, maxrss_kb: tok.maxrss_kb, value: /^\d+$/.test(tokenText) ? Number(tokenText) : tokenText, stderr: tok.stderr.slice(-2000) },
  };
  results.push(entry);
  console.log(JSON.stringify({ id: c.id, rea_exit: entry.rea_full.exit, rea_bytes: entry.rea_full.bytes, rea_tokens: entry.rea_tokens.value }));
}

writeFileSync(join(OUT, "baseline.json"), JSON.stringify({ generated_at: new Date().toISOString(), cases: results }, null, 2));
console.log(JSON.stringify({ ok: true, out: join(OUT, "baseline.json") }));
