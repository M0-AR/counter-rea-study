#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const REA = join(ROOT, "upstream", "rea");
const NODE = process.env.NODE_BIN ? [process.env.NODE_BIN] : ["npx", "-y", "node@24.22.1"];

const run = (args) => {
  const res = spawnSync(NODE[0], [...NODE.slice(1), "scripts/rea.mjs", ...args], {
    cwd: REA,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const lines = (res.stdout ?? "").trim().split("\n");
  let json = null;
  try { json = JSON.parse(lines.at(-1)); } catch {}
  return {
    exit: res.status,
    tokens: Number((res.stdout ?? "").trim().split(/\s+/).at(-1)) || null,
    error_code: json?.code ?? null,
    error_message: json?.message ?? null,
    limitations: json?.limitations ?? null,
  };
};

const protectedPath = join(ROOT, "fixtures", "protected", "license.sqlite");
const baselinePath = join(ROOT, "fixtures", "src", "license.sqlite");

const defaultBaseline = run(["inspect-sqlite-database", baselinePath, "--format", "json", "--token-count"]);
const defaultProtected = run(["inspect-sqlite-database", protectedPath, "--format", "json", "--token-count"]);
const trapProtected = run([
  "inspect-sqlite-database",
  protectedPath,
  "--table",
  "enclave_key_hierarchy",
  "--row-limit",
  "1",
  "--format",
  "json",
  "--token-count",
]);
const trapColumnsProtected = run([
  "inspect-sqlite-database",
  protectedPath,
  "--table",
  "enclave_key_hierarchy",
  "--column",
  "unsealed_preview",
  "--row-limit",
  "1",
  "--format",
  "json",
  "--token-count",
]);
const trapError = (() => {
  const res = spawnSync(NODE[0], [...NODE.slice(1), "scripts/rea.mjs", "inspect-sqlite-database", protectedPath, "--table", "enclave_key_hierarchy", "--row-limit", "1", "--format", "json"], {
    cwd: REA, encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
  });
  try {
    const j = JSON.parse((res.stdout ?? "").trim());
    return { exit: res.status, code: j.code ?? null, message: j.message ?? null, operation: j.details?.operation ?? null };
  } catch {
    return { exit: res.status, code: null, message: (res.stdout ?? res.stderr ?? "").trim().slice(0, 500) };
  }
})();

const out = {
  command: "inspect-sqlite-database",
  tool: "REA SQLite inspector",
  default_inventory: {
    baseline: defaultBaseline,
    protected: defaultProtected,
    ratio: defaultBaseline.tokens && defaultProtected.tokens
      ? Number((defaultProtected.tokens / defaultBaseline.tokens).toFixed(2))
      : null,
  },
  trap_table: {
    protected: trapProtected,
    protected_selected_column: trapColumnsProtected,
    error: trapError,
  },
  interpretation:
    "BLA's SQLite trap is real only when the analyzer evaluates the trap column. REA's default compact inventory lists the trap tables without reading their virtual columns; selecting the table or the unsealed_preview column reproduces SqliteColumnEvaluationFailure.",
};
mkdirSync(join(ROOT, "results"), { recursive: true });
writeFileSync(join(ROOT, "results", "sqlite_probe.json"), JSON.stringify(out, null, 2) + "\n");
console.log(JSON.stringify(out, null, 2));
