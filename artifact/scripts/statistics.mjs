#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const R = join(ROOT, "results");
const summary = JSON.parse(readFileSync(join(R, "summary.json"), "utf8"));
const reps = [1, 2, 3, 4, 5].map((i) => JSON.parse(readFileSync(join(ROOT, "..", "data", "raw", `bla-bench-${i}.json`), "utf8")));
const replications = JSON.parse(readFileSync(join(R, "replications.json"), "utf8"));
const intensity = JSON.parse(readFileSync(join(R, "intensity_equivalence.json"), "utf8"));
const mcp = summary.mcp;
const tokenizer = JSON.parse(readFileSync(join(R, "tokenizer_equivalence.json"), "utf8"));

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs) => {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length);
};
const pearson = (x, y) => {
  const mx = mean(x), my = mean(y);
  const num = x.reduce((s, xi, i) => s + (xi - mx) * (y[i] - my), 0);
  const den = Math.sqrt(x.reduce((s, xi) => s + (xi - mx) ** 2, 0) * y.reduce((s, yi) => s + (yi - my) ** 2, 0));
  return den === 0 ? null : num / den;
};
const ranks = (xs) => {
  const order = xs.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]);
  const out = Array(xs.length);
  order.forEach(([, i], rank) => { out[i] = rank + 1; });
  return out;
};
const spearman = (x, y) => pearson(ranks(x), ranks(y));
const mulberry32 = (a) => () => {
  a |= 0; a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const q = (xs, p) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) * p)];
};

const successful = summary.cases.filter((c) => c.token_ratio !== null && !c.transport.startsWith("MCP"));
const claimed = successful.map((c) => c.bla_claimed.token_factor);
const measured = successful.map((c) => c.token_ratio);
const logClaimed = claimed.map(Math.log10);
const logMeasured = measured.map(Math.log10);

const rng = mulberry32(0xc0ffee);
const boot = [];
for (let i = 0; i < 10000; i += 1) {
  const idx = Array.from({ length: successful.length }, () => Math.floor(rng() * successful.length));
  boot.push(pearson(idx.map((j) => logClaimed[j]), idx.map((j) => logMeasured[j])));
}
const slopeDen = logMeasured.reduce((s, x) => s + (x - mean(logMeasured)) ** 2, 0);
const slope = logMeasured.reduce((s, x, i) => s + (x - mean(logMeasured)) * (logClaimed[i] - mean(logClaimed)), 0) / slopeDen;
const intercept = mean(logClaimed) - slope * mean(logMeasured);
const rmseRegression = Math.sqrt(mean(logClaimed.map((x, i) => (x - (slope * logMeasured[i] + intercept)) ** 2)));
const rmseZeroModel = Math.sqrt(mean(logClaimed.map((x, i) => (x - logMeasured[i]) ** 2)));

const benchTokens = reps.map((r) => r.aggregateTokenMultiplier);
const benchCosts = reps.map((r) => r.aggregateCostMultiplier);
const repStats = Object.fromEntries(Object.entries(replications).map(([k, v]) => [k, {
  runs: v.length,
  tokens_unique: [...new Set(v.map((x) => x.tokens))],
  wall_ms_min: Math.min(...v.map((x) => x.wall_ms)),
  wall_ms_max: Math.max(...v.map((x) => x.wall_ms)),
  exit_codes: [...new Set(v.map((x) => x.exit))],
}]));

const baseJs = summary.intensity.js.baseline;
const baseWasm = summary.intensity.wasm.baseline;
const intensityOut = {
  js: Object.fromEntries(["stealth", "balanced", "maximum", "bankrupt"].map((k) => [k, {
    tokens: summary.intensity.js[k],
    ratio: Number((summary.intensity.js[k] / baseJs).toFixed(2)),
    functional: intensity.js[k].functional,
    bytes: intensity.js[k].bytes,
  }])),
  wasm: Object.fromEntries(["stealth", "balanced", "maximum", "bankrupt"].map((k) => [k, {
    tokens: summary.intensity.wasm[k],
    ratio: Number((summary.intensity.wasm[k] / baseWasm).toFixed(2)),
    functional: intensity.wasm[k].functional,
    compute_digest: intensity.wasm[k].compute_digest,
    export_count: intensity.wasm[k].export_count,
    bytes: intensity.wasm[k].bytes,
  }])),
  bankrupt_step_multiple: {
    js: Number((summary.intensity.js.bankrupt / summary.intensity.js.maximum).toFixed(2)),
    wasm: Number((summary.intensity.wasm.bankrupt / summary.intensity.wasm.maximum).toFixed(2)),
  },
};

const overclaim = Object.fromEntries(successful.map((c, i) => [c.id, Number((claimed[i] / measured[i]).toFixed(2))]));
const tokenizerCases = successful.filter((c) => tokenizer.cases[c.id]);
const clClaimed = tokenizerCases.map((c) => c.bla_claimed.token_factor);
const clMeasured = tokenizerCases.map((c) => tokenizer.cases[c.id].ratio);
const clLogClaimed = clClaimed.map(Math.log10);
const clLogMeasured = clMeasured.map(Math.log10);

const out = {
  generated_at: new Date().toISOString(),
  units: { tokens: "REA --token-count (REA tokenizer)", ratios: "protected / unprotected" },
  sample: { successful_cli_cases: successful.length, ids: successful.map((c) => c.id) },
  claimed_vs_measured: {
    claimed,
    measured,
    pearson_raw: pearson(claimed, measured),
    pearson_log10: pearson(logClaimed, logMeasured),
    spearman: spearman(claimed, measured),
    pearson_log10_bootstrap_95: [q(boot, 0.025), q(boot, 0.975)],
    loglog_slope: slope,
    loglog_intercept: intercept,
    log10_rmse_regression_residual: rmseRegression,
    log10_rmse_zero_model: rmseZeroModel,
    geometric_mean_claimed: Math.pow(10, mean(logClaimed)),
    geometric_mean_measured: Math.pow(10, mean(logMeasured)),
    claimed_over_measured: overclaim,
    tokenizer_sensitivity: {
      tokenizer: tokenizer.tokenizer,
      n: tokenizerCases.length,
      measured: clMeasured,
      pearson_log10: pearson(clLogClaimed, clLogMeasured),
      spearman: spearman(clClaimed, clMeasured),
      loglog_slope: clLogMeasured.reduce((s, x, i) => s + (x - mean(clLogMeasured)) * (clLogClaimed[i] - mean(clLogClaimed)), 0) / clLogMeasured.reduce((s, x) => s + (x - mean(clLogMeasured)) ** 2, 0),
      geometric_mean_measured: Math.pow(10, mean(clLogMeasured)),
    },
  },
  outcomes: {
    amplified_default: summary.cases.filter((c) => c.token_ratio !== null && c.token_ratio >= 10 && !c.transport.startsWith("MCP") && c.id !== "asar-raised-32m").map((c) => c.id),
    neutral_default: summary.cases.filter((c) => c.token_ratio !== null && c.token_ratio < 2 && !c.transport.startsWith("MCP")).map((c) => c.id),
    refused_default: summary.cases.filter((c) => c.outcome.startsWith("denied") && c.id !== "js-mcp-complete").map((c) => c.id),
    amplified_after_override: "asar-raised-32m",
  },
  bla_benchmark: {
    runs: benchTokens.length,
    token: { mean: mean(benchTokens), sd: sd(benchTokens), min: Math.min(...benchTokens), max: Math.max(...benchTokens) },
    cost: { mean: mean(benchCosts), sd: sd(benchCosts), min: Math.min(...benchCosts), max: Math.max(...benchCosts) },
    readme_claim: { token: 639.5, cost: 304.4 },
    drift_multiple: { token: mean(benchTokens) / 639.5, cost: mean(benchCosts) / 304.4 },
    functional_integrity_verified: false,
    runtime_equivalence: "not-tested",
  },
  replications: repStats,
  intensity: intensityOut,
  transport: {
    cli_full_js_tokens: summary.cases.find((c) => c.id === "js-app").protected_tokens,
    mcp_summary_protected_tokens: mcp.summary.protected_tokens,
    mcp_summary_unprotected_tokens: mcp.summary.unprotected_tokens,
    cli_to_mcp_summary_multiple: Number((summary.cases.find((c) => c.id === "js-app").protected_tokens / mcp.summary.protected_tokens).toFixed(2)),
    mcp_complete_error: mcp.complete.error,
    mcp_complete_budget_bytes: mcp.complete.budget_bytes,
  },
  pcap_tool_query_sensitivity: {
    summary_tool_ratio: summary.pcap.summary_tool.ratio,
    field_query_ratios: Object.fromEntries(Object.entries(summary.pcap.profiles).map(([k, v]) => [k, v.ratio])),
    range_multiple: Number((summary.pcap.profiles.payload.ratio / summary.pcap.profiles.narrow.ratio).toFixed(2)),
  },
};
writeFileSync(join(R, "statistics.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
