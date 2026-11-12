#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const bla = join(here, "..", "upstream", "bla");
const outDir = join(root, "data");
mkdirSync(outDir, { recursive: true });

const identity = JSON.parse(readFileSync(join(bla, "package.json"), "utf8"));
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

const benchmark = readJson(join(root, "data", "raw", "bla-benchmark.json"));
const selfValidation = readJson(
  join(bla, "docs", "redteam", "empirical-rea-validation.json"),
);

const verifyDir = join(here, "..", "results", "raw");
const verifyCases = [
  "js-app",
  "asar",
  "wasm",
  "sqlite",
  "safetensors",
  "gguf",
  "beam",
  "evm",
  "pcap",
  "ptx",
  "elf",
  "pyc",
];
const verify = {};
for (const id of verifyCases) {
  const path = join(verifyDir, id, "bla.verify.json");
  if (!existsSync(path)) continue;
  const data = readJson(path);
  verify[id] = {
    format: data.detectedFormat,
    overallPassed: data.overallPassed,
    functionalIntegrityVerified: data.functionalIntegrityVerified,
    runtimeEquivalence: data.runtimeEquivalence,
    verificationScope: data.verificationScope,
    tokenAmplificationFactor: data.tokenAmplificationFactor,
    costAmplificationFactor: data.costAmplificationFactor,
    checkCount: data.checks?.length ?? 0,
    checks: (data.checks ?? []).map((c) => ({
      id: c.id,
      passed: c.passed,
      details: c.details,
    })),
  };
}

const benchmarkSummary = {
  source: "artifact/upstream/bla benchmark output (data/raw/bla-benchmark.json)",
  blaVersion: benchmark.blaVersion,
  aggregateTokenMultiplier: benchmark.aggregateTokenMultiplier,
  aggregateCostMultiplier: benchmark.aggregateCostMultiplier,
  cases: benchmark.cases.map((c) => ({
    id: c.id,
    format: c.format,
    beforeTokens: c.before.estimatedTokens,
    afterTokens: c.after.estimatedTokens,
    tokenMultiplier: c.tokenMultiplier,
    costMultiplier: c.costMultiplier,
    functionalCheckPassed: c.functionalCheckPassed,
    afterOutcome: c.after.agentOutcome,
    triggeredLimits: c.after.triggeredLimits ?? [],
  })),
};

const selfValidationSummary = {
  source: "artifact/upstream/bla/docs/redteam/empirical-rea-validation.json",
  generatedAt: selfValidation.generatedAt,
  intensity: selfValidation.intensity,
  nodeVersion: selfValidation.nodeVersion,
  tshark: selfValidation.tshark,
  pairs: selfValidation.pairs.map((p) => ({
    format: p.format,
    beforeBytes: p.before.inputBytes,
    afterBytes: p.after.inputBytes,
    beforeStatus: p.before.status,
    afterStatus: p.after.status,
    errorName: p.after.errorName,
    errorMessage: p.after.errorMessage,
    budgetHit: p.after.budgetHit,
    budgetName: p.after.budgetName,
    redactionOrAmbiguity: p.after.redactionOrAmbiguity,
  })),
  unverified: selfValidation.unverified.map((u) => ({
    analyzer: u.analyzer,
    reason: u.reason,
  })),
};

const payload = {
  pinnedCommit: "9c41bb53b040797e098954c4007425981f3a7a6b",
  package: { name: identity.name, version: identity.version },
  benchmark: benchmarkSummary,
  selfValidation: selfValidationSummary,
  verify,
};

writeFileSync(join(outDir, "bla-self-validation.json"), JSON.stringify(selfValidationSummary, null, 2) + "\n");
writeFileSync(join(outDir, "bla-benchmark-factors.json"), JSON.stringify(benchmarkSummary, null, 2) + "\n");
writeFileSync(join(outDir, "bla-verify-factors.json"), JSON.stringify(verify, null, 2) + "\n");
writeFileSync(join(outDir, "bla-evidence.json"), JSON.stringify(payload, null, 2) + "\n");
console.log(`wrote data/bla-evidence.json (${Object.keys(verify).length} verify reports, ${selfValidationSummary.pairs.length} live-REA pairs)`);
