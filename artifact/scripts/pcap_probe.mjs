#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const BLA = join(ROOT, "upstream", "bla");
const REA = join(ROOT, "upstream", "rea");
const SRC = join(ROOT, "fixtures", "src", "traffic.pcap");
const OUT = join(ROOT, "results", "pcap");
const NODE = process.env.NODE_BIN ? [process.env.NODE_BIN] : ["npx", "-y", "node@24.22.1"];

mkdirSync(OUT, { recursive: true });
const target = join(OUT, "traffic.protected.pcap");

const run = (cmd, args, opts = {}) => {
  const started = process.hrtime.bigint();
  const res = spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...opts });
  return {
    exit: res.status,
    wall_ms: Math.round(Number(process.hrtime.bigint() - started) / 1e6),
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? "",
    error: res.error ? String(res.error) : null,
  };
};

const protect = run(NODE[0], [...NODE.slice(1), "dist/cli.js", "protect", SRC, "-o", target, "--intensity", "bankrupt", "--seed", "counter-rea-pcap-v1", "--json"], { cwd: BLA });
const analyze = (input, label, fields = ["frame.number"]) => {
  const args = ["scripts/rea.mjs", "inspect-packet-capture", input, ...fields.flatMap((f) => ["--fields", f]), "--all_matches", "--format", "json"];
  const full = run(NODE[0], [...NODE.slice(1), ...args, "--timings"], { cwd: REA });
  writeFileSync(join(OUT, `${label}.full.json`), full.stdout);
  writeFileSync(join(OUT, `${label}.full.stderr`), full.stderr);
  const tok = run(NODE[0], [...NODE.slice(1), ...args, "--token-count"], { cwd: REA });
  let parsed = null;
  try { parsed = JSON.parse(full.stdout); } catch {}
  return {
    exit: full.exit,
    wall_ms: full.wall_ms,
    bytes: Buffer.byteLength(full.stdout),
    tokens: /^\d+$/.test(tok.stdout.trim()) ? Number(tok.stdout.trim()) : tok.stdout.trim(),
    token_exit: tok.exit,
    code: parsed?.code ?? null,
    message: parsed?.message ?? null,
    limitations: parsed?.limitations ?? null,
    packet_count: parsed?.normalized_result?.statistics?.packet_count ?? null,
    stderr: full.stderr.slice(-2000),
  };
};

const analyzeSummary = (input, label) => {
  const args = ["scripts/rea.mjs", "inspect-pcap-capture", input, "--format", "json"];
  const full = run(NODE[0], [...NODE.slice(1), ...args, "--timings"], { cwd: REA });
  writeFileSync(join(OUT, `${label}.full.json`), full.stdout);
  writeFileSync(join(OUT, `${label}.full.stderr`), full.stderr);
  const tok = run(NODE[0], [...NODE.slice(1), ...args, "--token-count"], { cwd: REA });
  let parsed = null;
  try { parsed = JSON.parse(full.stdout); } catch {}
  return {
    tool: "inspect-pcap-capture",
    exit: full.exit,
    wall_ms: full.wall_ms,
    bytes: Buffer.byteLength(full.stdout),
    tokens: /^\d+$/.test(tok.stdout.trim()) ? Number(tok.stdout.trim()) : tok.stdout.trim(),
    token_exit: tok.exit,
    code: parsed?.code ?? null,
    message: parsed?.message ?? null,
    limitations: parsed?.limitations ?? null,
    packet_count: parsed?.normalized_result?.statistics?.packet_count ?? null,
    stderr: full.stderr.slice(-2000),
  };
};

const packets = (p) => {
  const r = spawnSync("tshark", ["-r", p, "-T", "fields", "-e", "ip.src", "-e", "ip.dst", "-e", "tcp.srcport", "-e", "tcp.dstport"], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  return { exit: r.status, rows: r.stdout.trim().split("\n").filter(Boolean), stderr: r.stderr.trim().slice(-1000) };
};

const tsharkJsonBytes = (p) => {
  const r = spawnSync("tshark", ["-r", p, "-T", "json"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  let packets = null;
  try { packets = r.status === 0 ? JSON.parse(r.stdout).length : null; } catch {}
  return { exit: r.status, bytes: Buffer.byteLength(r.stdout), packets, stderr: r.stderr.trim().slice(-1000) };
};

const profiles = {
  narrow: ["frame.number"],
  broad: ["frame.number", "ip.src", "ip.dst", "tcp.srcport", "tcp.dstport", "frame.protocols"],
  payload: ["frame.number", "tcp.payload"],
};

const out = {
  generated_at: new Date().toISOString(),
  input: { path: SRC, bytes: readFileSync(SRC).length, tshark: run("tshark", ["-v"]).stdout.split("\n")[0] },
  protect: { exit: protect.exit, wall_ms: protect.wall_ms, stderr: protect.stderr.slice(-2000) },
  protected: { path: target, bytes: existsSync(target) ? readFileSync(target).length : null },
  summary_tool: {
    baseline: analyzeSummary(SRC, "baseline.summary"),
    protected: analyzeSummary(target, "protected.summary"),
  },
  profiles: {},
  tshark_baseline: packets(SRC),
  tshark_protected: packets(target),
  tshark_json_baseline: tsharkJsonBytes(SRC),
  tshark_json_protected: tsharkJsonBytes(target),
};
for (const [name, fields] of Object.entries(profiles)) {
  out.profiles[name] = {
    fields,
    baseline: analyze(SRC, `baseline.${name}`, fields),
    protected: analyze(target, `protected.${name}`, fields),
  };
}
out.tshark_preserved = out.tshark_baseline.rows.every((row) => out.tshark_protected.rows.includes(row));
writeFileSync(join(ROOT, "results", "pcap.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
