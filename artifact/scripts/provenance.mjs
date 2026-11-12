#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const cmd = (c, args) => {
  const r = spawnSync(c, args, { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim().split("\n")[0] : null;
};
const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
const files = (dir) => existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]) : [];
const map = (dirs) => Object.fromEntries(dirs.flatMap((d) => files(join(ROOT, d)).map((p) => [p.replace(ROOT + "/", ""), sha(p)])));

const out = {
  generated_at: new Date().toISOString(),
  uname: cmd("uname", ["-a"]),
  node: process.version,
  npm: cmd("npm", ["-v"]),
  python: cmd("python3", ["--version"]),
  docker: cmd("docker", ["--version"]),
  tshark: cmd("tshark", ["-v"]),
  wabt: cmd(join(process.env.REA_WABT_BIN_DIRECTORY ?? "/tmp/opencode/wabt/bin", "wasm-validate"), ["--version"]),
  upstream: {
    bla: cmd("git", ["-C", join(ROOT, "upstream/bla"), "rev-parse", "HEAD"]),
    rea: cmd("git", ["-C", join(ROOT, "upstream/rea"), "rev-parse", "HEAD"]),
  },
  lockfiles: {
    bla: sha(join(ROOT, "upstream/bla/package-lock.json")),
    rea: sha(join(ROOT, "upstream/rea/package-lock.json")),
  },
  fixtures: map(["fixtures/src", "fixtures/protected"]),
};
const target = process.env.ENV_OUT ?? join(ROOT, "results", "env.json");
writeFileSync(target, JSON.stringify(out, null, 2));
console.log(JSON.stringify({ ok: true, target, upstream: out.upstream, node: out.node, tshark: out.tshark, wabt: out.wabt }));
