#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const REA = join(ROOT, "upstream", "rea");
const PROT = join(ROOT, "fixtures", "protected");
const NODE = process.env.NODE_BIN ? [process.env.NODE_BIN] : ["npx", "-y", "node@24.22.1"];
const WABT = process.env.REA_WABT_BIN_DIRECTORY ?? "/tmp/opencode/wabt/bin";

const cases = {
  js: ["analyze-javascript-application", join(PROT, "js-app")],
  wasm: ["inspect-wasm-artifact", join(PROT, "module.preserve.wasm")],
  evm: ["inspect-evm-interface", join(PROT, "Vault.evm"), "raw"],
};

const out = {};
for (const [id, args] of Object.entries(cases)) {
  out[id] = [];
  for (let i = 0; i < 3; i += 1) {
    const started = process.hrtime.bigint();
    const res = spawnSync(NODE[0], [...NODE.slice(1), "scripts/rea.mjs", ...args, "--format", "json", "--token-count"], {
      cwd: REA,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, REA_WABT_BIN_DIRECTORY: WABT },
    });
    out[id].push({
      tokens: (res.stdout ?? "").trim().split(/\s+/).at(-1),
      wall_ms: Math.round(Number(process.hrtime.bigint() - started) / 1e6),
      exit: res.status,
    });
  }
}
writeFileSync(join(ROOT, "results", "replications.json"), JSON.stringify(out, null, 2) + "\n");
console.log(JSON.stringify(out, null, 2));
