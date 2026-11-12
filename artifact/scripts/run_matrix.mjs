#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const BLA = join(ROOT, "upstream", "bla");
const REA = join(ROOT, "upstream", "rea");
const SRC = join(ROOT, "fixtures", "src");
const PROT = join(ROOT, "fixtures", "protected");
const OUT = join(ROOT, "results");
const RAW = join(OUT, "raw");
const NODE = process.env.NODE_BIN ? [process.env.NODE_BIN] : ["npx", "-y", "node@24.22.1"];

const cases = [
  { id: "js-app", src: join(SRC, "app", "license.js"), mode: "js-dir", rea: "analyze-javascript-application" },
  { id: "asar", src: join(SRC, "app.asar"), rea: "analyze-javascript-application" },
  { id: "wasm", src: join(SRC, "module.wasm"), rea: "inspect-wasm-artifact" },
  { id: "sqlite", src: join(SRC, "license.sqlite"), rea: "inspect-sqlite-database" },
  { id: "safetensors", src: join(SRC, "weights.safetensors"), rea: "inspect-model-artifact" },
  { id: "gguf", src: join(SRC, "model.gguf"), rea: "inspect-model-artifact" },
  { id: "beam", src: join(SRC, "guard.beam"), rea: "inspect-erlang-beam" },
  { id: "evm", src: join(SRC, "Vault.evm"), rea: "inspect-evm-interface", reaArgs: ["raw"] },
  { id: "pcap", src: join(SRC, "traffic.pcap"), rea: "inspect-packet-capture" },
  { id: "ptx", src: join(SRC, "kernel.ptx"), rea: "inspect-gpu-code-objects" },
  { id: "elf", src: join(SRC, "native.elf"), rea: "inspect-native-exports" },
  { id: "pyc", src: join(SRC, "license.pyc"), rea: "inspect-python-pyc" },
];

const run = (cmd, args, opts = {}) => {
  const started = process.hrtime.bigint();
  const res = spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...opts });
  const wallMs = Number(process.hrtime.bigint() - started) / 1e6;
  return {
    exit: res.status,
    signal: res.signal,
    wall_ms: Math.round(wallMs),
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? "",
    error: res.error ? String(res.error) : null,
  };
};

const timed = (cmd, args, cwd, outPath, timePath) => {
  const fd = openSync(outPath, "w");
  const errFd = openSync(outPath + ".stderr", "w");
  const res = run("/usr/bin/time", ["-f", "%e %M", "-o", timePath, ...cmd, ...args], {
    cwd,
    stdio: ["ignore", fd, errFd],
  });
  closeSync(fd);
  closeSync(errFd);
  const timing = existsSync(timePath) ? readFileSync(timePath, "utf8").trim().split(/\s+/) : [];
  const bytes = existsSync(outPath) ? readFileSync(outPath).length : 0;
  const stderr = existsSync(outPath + ".stderr") ? readFileSync(outPath + ".stderr", "utf8") : "";
  return { ...res, stderr, bytes, wall_s: Number(timing[0]), maxrss_kb: Number(timing[1]) };
};

const jsonOf = (path) => {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
};

rmSync(RAW, { recursive: true, force: true });
rmSync(PROT, { recursive: true, force: true });
mkdirSync(RAW, { recursive: true });
mkdirSync(PROT, { recursive: true });

const results = [];

for (const c of cases) {
  const dir = join(RAW, c.id);
  mkdirSync(dir, { recursive: true });
  const entry = { id: c.id, src: c.src, input_bytes: readFileSync(c.src).length };

  let target;
  if (c.mode === "js-dir") {
    const appDir = join(PROT, "js-app");
    mkdirSync(appDir, { recursive: true });
    target = join(appDir, "license.js");
    copyFileSync(join(SRC, "app", "package.json"), join(appDir, "package.json"));
  } else {
    target = join(PROT, c.id === "asar" ? "app.asar" : c.src.split("/").pop());
  }

  const protect = run(NODE[0], [...NODE.slice(1), "dist/cli.js", "protect", c.src, "-o", target, "--intensity", "bankrupt", "--seed", `counter-rea-${c.id}-v1`, "--json"], { cwd: BLA });
  writeFileSync(join(dir, "protect.stdout.json"), protect.stdout);
  writeFileSync(join(dir, "protect.stderr.txt"), protect.stderr);
  entry.protect = { exit: protect.exit, wall_ms: protect.wall_ms, json: jsonOf(join(dir, "protect.stdout.json")) };
  entry.protected_bytes = existsSync(target) ? readFileSync(target).length : 0;
  entry.size_ratio = entry.input_bytes > 0 ? entry.protected_bytes / entry.input_bytes : null;

  if (protect.exit !== 0 || !existsSync(target)) {
    entry.status = "protect_failed";
    results.push(entry);
    continue;
  }

  const reaTarget = c.mode === "js-dir" ? join(PROT, "js-app") : target;
  const reaArgs = [c.rea, reaTarget, ...(c.reaArgs ?? []), "--format", "json"];

  const full = timed(NODE, ["scripts/rea.mjs", ...reaArgs, "--timings"], REA, join(dir, "rea.full.json"), join(dir, "rea.full.time"));
  entry.rea_full = { exit: full.exit, wall_s: full.wall_s, maxrss_kb: full.maxrss_kb, bytes: full.bytes, stderr: full.stderr.slice(-2000) };
  const fullJson = jsonOf(join(dir, "rea.full.json"));
  if (fullJson) {
    entry.rea_full.confidence = fullJson.confidence ?? null;
    entry.rea_full.evidence_id = fullJson.evidence_id ?? null;
    entry.rea_full.limitations = Array.isArray(fullJson.limitations) ? fullJson.limitations : [];
    entry.rea_full.statistics = fullJson.normalized_result?.statistics ?? null;
    entry.rea_full.semantic = fullJson.normalized_result?.semantic_graph
      ? {
          nodes: fullJson.normalized_result.semantic_graph.nodes?.length ?? null,
          relations: fullJson.normalized_result.semantic_graph.relations?.length ?? null,
          unknowns: fullJson.normalized_result.semantic_graph.unknowns?.length ?? null,
          coverage: fullJson.normalized_result.semantic_graph.coverage ?? null,
        }
      : null;
  }

  const tok = timed(NODE, ["scripts/rea.mjs", ...reaArgs, "--token-count"], REA, join(dir, "rea.tokens.txt"), join(dir, "rea.tokens.time"));
  const tokenText = readFileSync(join(dir, "rea.tokens.txt"), "utf8").trim();
  entry.rea_tokens = { exit: tok.exit, wall_s: tok.wall_s, maxrss_kb: tok.maxrss_kb, value: /^\d+$/.test(tokenText) ? Number(tokenText) : tokenText, stderr: tok.stderr.slice(-2000) };

  if (c.mode === "js-dir" || c.id === "asar") {
    const evPath = join(dir, "evidence.bundle");
    const sum = timed(NODE, ["scripts/rea.mjs", c.rea, reaTarget, "--detail", "summary", "--evidence_output", evPath, "--format", "json", "--timings"], REA, join(dir, "rea.summary.json"), join(dir, "rea.summary.time"));
    const sumJson = jsonOf(join(dir, "rea.summary.json"));
    entry.rea_summary = { exit: sum.exit, wall_s: sum.wall_s, maxrss_kb: sum.maxrss_kb, bytes: sum.bytes, confidence: sumJson?.confidence ?? null, limitations: sumJson?.limitations ?? [] };
    entry.evidence_bundle_bytes = existsSync(evPath) ? readFileSync(evPath).length : null;
  }

  const verify = run(NODE[0], [...NODE.slice(1), "dist/cli.js", "verify", target, c.src, "--json"], { cwd: BLA });
  writeFileSync(join(dir, "bla.verify.json"), verify.stdout);
  writeFileSync(join(dir, "bla.verify.stderr.txt"), verify.stderr);
  entry.bla_verify = { exit: verify.exit, wall_ms: verify.wall_ms, json: jsonOf(join(dir, "bla.verify.json")) };
  entry.status = "ok";
  results.push(entry);
  console.log(JSON.stringify({ id: c.id, input_bytes: entry.input_bytes, protected_bytes: entry.protected_bytes, size_ratio: entry.size_ratio, rea_exit: entry.rea_full.exit, rea_bytes: entry.rea_full.bytes, rea_tokens: entry.rea_tokens.value }));
}

writeFileSync(join(OUT, "matrix.json"), JSON.stringify({ generated_at: new Date().toISOString(), cases: results }, null, 2));
console.log(JSON.stringify({ ok: true, cases: results.length, out: join(OUT, "matrix.json") }));
