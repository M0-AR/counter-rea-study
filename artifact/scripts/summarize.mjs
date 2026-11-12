#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const R = join(ROOT, "results");
const matrix = JSON.parse(readFileSync(join(R, "matrix.json"), "utf8"));
const baseline = JSON.parse(readFileSync(join(R, "baseline", "baseline.json"), "utf8"));
const variants = JSON.parse(readFileSync(join(R, "variants", "variants.json"), "utf8"));
const eq = JSON.parse(readFileSync(join(R, "equivalence.json"), "utf8")).results;
const intensity = JSON.parse(readFileSync(join(R, "intensity_equivalence.json"), "utf8"));
const pcap = JSON.parse(readFileSync(join(R, "pcap.json"), "utf8"));
const pcapStats = pcap.profiles;

const base = new Map(baseline.cases.map((c) => [c.id, c]));
const mcase = new Map(matrix.cases.map((c) => [c.id, c]));
const vcase = new Map(variants.variants.map((c) => [c.id, c]));

const rows = [];
const add = (o) => rows.push(o);

const claimed = (id) => {
  const v = mcase.get(id)?.bla_verify?.json ?? {};
  return {
    token_factor: v.tokenAmplificationFactor ?? null,
    cost_factor: v.costAmplificationFactor ?? null,
    overall_passed: v.overallPassed ?? null,
    functional_integrity: v.functionalIntegrityVerified ?? null,
    runtime_equivalence: v.runtimeEquivalence?.status ?? null,
  };
};

const mk = ({ id, format, baseline_tokens, protected_tokens, protected_exit, error_code = null, outcome, input_bytes, protected_bytes, equivalence, notes, transport = "CLI full JSON" }) => {
  const c = mcase.get(id);
  const b = base.get(id);
  const cl = claimed(id);
  const bt = baseline_tokens ?? b?.rea_tokens?.value ?? null;
  const pt = protected_tokens ?? c?.rea_tokens?.value ?? null;
  const denied = outcome.startsWith("denied") || outcome.startsWith("blocked");
  add({
    id,
    format,
    baseline_tokens: bt,
    protected_tokens: pt,
    token_ratio: !denied && bt && pt ? Number((pt / bt).toFixed(2)) : null,
    protected_exit,
    error_code,
    outcome,
    input_bytes: input_bytes ?? c?.input_bytes ?? b?.input_bytes ?? null,
    protected_bytes: protected_bytes ?? c?.protected_bytes ?? null,
    size_ratio: input_bytes && protected_bytes ? Number((protected_bytes / input_bytes).toFixed(2)) : null,
    bla_claimed: cl,
    independent_equivalence: equivalence ?? null,
    transport,
    notes,
  });
};

mk({ id: "js-app", format: "JavaScript app", protected_exit: 0, outcome: "amplified", equivalence: "pass (4 function vectors; 3 outputs)", notes: "CLI full evidence; MCP complete hard-fails at 10 MiB, MCP summary = 4,645 tokens (1.67x)." });
mk({ id: "asar", format: "Electron ASAR", protected_exit: 1, error_code: "truncated", outcome: "denied (default 16 MiB ASAR header cap)", notes: "Raising REA_ASAR_MAX_HEADER_BYTES to 32 MiB converts denial into 47,243,269 tokens / 236,579,520 bytes." });
mk({ id: "wasm", format: "WebAssembly", protected_exit: 0, outcome: "amplified", equivalence: "pass with --wasm-preserve-exports computeDigest", notes: "Measured with WABT 1.0.42; preserve variant keeps the public ABI and adds 250 export decoys.", protected_tokens: vcase.get("wasm-fixed")?.rea_tokens?.value, baseline_tokens: vcase.get("wasm-baseline-fixed")?.rea_tokens?.value, protected_bytes: 6879942 });
mk({ id: "sqlite", format: "SQLite", protected_exit: 0, outcome: "neutral", equivalence: "pass (rows identical; 5 decoy tables)", notes: "REA reads schema/rows only; appended decoy tables contribute little token cost." });
mk({ id: "safetensors", format: "Safetensors", protected_exit: 1, error_code: "resource_constraint", outcome: "denied (hard 32-level JSON nesting cap)", equivalence: "pass (huggingface safe_open loads; data identical)", notes: "No runtime override; injected metadata contains canary/deception strings." });
mk({ id: "gguf", format: "GGUF", protected_exit: 1, error_code: "resource_constraint", outcome: "denied (hard 32-frame metadata nesting cap)", equivalence: "pass (gguf Python reader loads; 30 fields vs 3)", notes: "No runtime override." });
mk({ id: "beam", format: "Erlang BEAM", protected_exit: 1, error_code: "resource_constraint", outcome: "denied (hard 256-chunk cap)", equivalence: "not tested (no Erlang runtime installed)", notes: "Baseline 864 tokens at --max-chunks 256; protected fails at 64 and at legal max 256.", protected_tokens: 196, baseline_tokens: 864 });
mk({ id: "evm", format: "EVM bytecode", protected_exit: 0, outcome: "amplified", equivalence: "prefix byte-identical; 4,190,169 bytes appended (ignored by EVM)", notes: "Measured 978.6x; WASM preserve variant is larger (2077.21x)." });
mk({ id: "pcap", format: "libpcap capture", protected_exit: 0, outcome: "amplified (14.37x on BLA's target summary tool; field queries 1.82x-275.4x)", equivalence: "pass (original 5-tuple preserved; 160 decoy TCP packets added)", notes: "TShark 4.0.17 in Docker; 14,323x file growth. BLA claims target inspect_pcap_capture; same tool measured. Caller-chosen field query changes cost by 150x.", protected_tokens: pcap.summary_tool.protected.tokens, baseline_tokens: pcap.summary_tool.baseline.tokens, input_bytes: pcap.input.bytes, protected_bytes: pcap.protected.bytes, transport: "CLI summary tool" });
mk({ id: "ptx", format: "NVIDIA PTX text", protected_exit: 0, outcome: "no amplification", equivalence: "prefix byte-identical; 26,285 bytes appended", notes: "REA GPU inspector ignores appended decoy PTX text: 1.006x measured vs 4,814x claimed." });
mk({ id: "elf", format: "Native ELF64", protected_exit: 0, outcome: "no amplification", equivalence: "pass (identical stdout/exit; entry point unchanged)", notes: "81.5x file growth but 1.008x token growth: REA reads export table only." });
mk({ id: "pyc", format: "CPython .pyc", protected_exit: 1, error_code: "invalid_request", outcome: "denied (REA rejects trailing marshal bytes)", equivalence: "pass (CPython imports and executes protected pyc)", notes: "BLA verify still reports overallPassed=true, functionalIntegrityVerified=false." });

const asarRaised = vcase.get("asar-raised-32m");
rows.push({
  id: "asar-raised-32m",
  format: "Electron ASAR (override)",
  baseline_tokens: base.get("asar")?.rea_tokens?.value,
  protected_tokens: asarRaised?.rea_tokens?.value,
  token_ratio: Number((asarRaised?.rea_tokens?.value / base.get("asar")?.rea_tokens?.value).toFixed(2)),
  protected_exit: 0,
  error_code: null,
  outcome: "amplified after documented override",
  input_bytes: 1335,
  protected_bytes: 18023350,
  size_ratio: Number((18023350 / 1335).toFixed(2)),
  bla_claimed: claimed("asar"),
  independent_equivalence: "pass (ASAR member license.js rewritten but runtime output matches)",
  transport: "CLI full JSON",
  notes: "One env var (REA_ASAR_MAX_HEADER_BYTES) converts hard denial into 47.2M tokens / 236.6 MB.",
});

rows.push({
  id: "js-mcp-complete",
  format: "JavaScript app via MCP (detail=complete)",
  baseline_tokens: null,
  protected_tokens: null,
  token_ratio: null,
  protected_exit: 1,
  error_code: "resource_constraint",
  outcome: "denied by 10 MiB MCP stdio budget (no truncation)",
  input_bytes: 811,
  protected_bytes: 141026,
  size_ratio: 174.0,
  bla_claimed: claimed("js-app"),
  independent_equivalence: "pass",
  transport: "MCP",
  notes: "response_bytes_at_least=10,577,078; evidence retained; no runtime override.",
});
rows.push({
  id: "js-mcp-summary",
  format: "JavaScript app via MCP (detail=summary)",
  baseline_tokens: 2786,
  protected_tokens: 4645,
  token_ratio: 1.67,
  protected_exit: 0,
  error_code: null,
  outcome: "near-neutral",
  input_bytes: 811,
  protected_bytes: 141026,
  size_ratio: 174.0,
  bla_claimed: claimed("js-app"),
  independent_equivalence: "pass",
  transport: "MCP summary",
  notes: "Protected summary response 36,037 bytes vs 21,129 unprotected.",
});

const out = {
  generated_at: new Date().toISOString(),
  upstream: {
    bla: "bla-agents 3.2.5 (9c41bb53b040797e098954c4007425981f3a7a6b)",
    rea: "rea-agents 6.9.0 (d74549e495c58eb4a560279fd9f05508401ea0a0)",
    node: "24.22.1",
    wabt: "1.0.42",
  },
  cases: rows,
  intensity: {
    js: {
      ...Object.fromEntries(["stealth", "balanced", "maximum", "bankrupt"].map((k) => [k, intensity.js[k].tokens])),
      baseline: intensity.baseline.js_tokens,
    },
    wasm: {
      ...Object.fromEntries(["stealth", "balanced", "maximum", "bankrupt"].map((k) => [k, intensity.wasm[k].tokens])),
      baseline: intensity.baseline.wasm_tokens,
    },
    equivalence: intensity,
  },
  mcp: {
    complete: { error: "resource_constraint", budget_bytes: 10485760, response_bytes_at_least: 10577078 },
    summary: { protected_bytes: 36037, unprotected_bytes: 21129, protected_tokens: 4645, unprotected_tokens: 2786 },
  },
  pcap: {
    file_bytes: { input: pcap.input.bytes, protected: pcap.protected.bytes },
    tshark_json_bytes: { input: pcap.tshark_json_baseline.bytes, protected: pcap.tshark_json_protected.bytes },
    packets: { input: pcap.tshark_json_baseline.packets, protected: pcap.tshark_json_protected.packets },
    preserved_5tuple: pcap.tshark_preserved,
    summary_tool: {
      command: "inspect-pcap-capture",
      baseline_tokens: pcap.summary_tool.baseline.tokens,
      protected_tokens: pcap.summary_tool.protected.tokens,
      ratio: Number((pcap.summary_tool.protected.tokens / pcap.summary_tool.baseline.tokens).toFixed(2)),
    },
    profiles: Object.fromEntries(Object.entries(pcap.profiles).map(([k, v]) => [k, {
      fields: v.fields,
      baseline_tokens: v.baseline.tokens,
      protected_tokens: v.protected.tokens,
      ratio: Number((v.protected.tokens / v.baseline.tokens).toFixed(2)),
    }])),
  },
};
writeFileSync(join(R, "summary.json"), JSON.stringify(out, null, 2));

const fmt = (x) => (x == null ? "—" : typeof x === "number" ? x.toLocaleString("en-US") : String(x));
const lines = [];
lines.push("| Case | Transport | Baseline tok | Protected tok | Measured × | Outcome | BLA claimed × | BLA pass | Indep. equivalence |");
lines.push("|---|---|---:|---:|---:|---|---:|---|---|");
for (const r of rows) {
  lines.push(`| ${r.id} | ${r.transport} | ${fmt(r.baseline_tokens)} | ${fmt(r.protected_tokens)} | ${fmt(r.token_ratio)} | ${r.outcome} | ${fmt(r.bla_claimed.token_factor)} | ${fmt(r.bla_claimed.overall_passed)} | ${r.independent_equivalence ?? "—"} |`);
}
lines.push("");
lines.push("### PCAP tool/query sensitivity (same protected artifact)");
lines.push("");
lines.push("| REA capture command / query | Baseline tok | Protected tok | Measured × |");
lines.push("|---|---:|---:|---:|");
lines.push(`| inspect-pcap-capture (BLA's target; fixed summary fields) | ${fmt(pcap.summary_tool.baseline.tokens)} | ${fmt(pcap.summary_tool.protected.tokens)} | ${fmt(Number((pcap.summary_tool.protected.tokens / pcap.summary_tool.baseline.tokens).toFixed(2)))} |`);
for (const [name, v] of Object.entries(pcap.profiles)) {
  lines.push(`| ${name}: ${v.fields.join(", ")} | ${fmt(v.baseline.tokens)} | ${fmt(v.protected.tokens)} | ${fmt(Number((v.protected.tokens / v.baseline.tokens).toFixed(2)))} |`);
}
lines.push("");
lines.push(`Full-field \`tshark -T json\` projection: ${fmt(pcap.tshark_json_baseline.bytes)} bytes / ${fmt(pcap.tshark_json_baseline.packets)} packet(s) unprotected; ${fmt(pcap.tshark_json_protected.bytes)} bytes / ${fmt(pcap.tshark_json_protected.packets)} packets protected. REA's summary tool requests a fixed field subset and stayed within its 8 MiB TShark-JSON cap; the payload query is a separate caller-selected command.`);
writeFileSync(join(R, "summary.md"), lines.join("\n") + "\n");
console.log(lines.join("\n"));
