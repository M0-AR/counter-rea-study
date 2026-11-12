#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const SRC = join(ROOT, "fixtures", "src");
const PROT = join(ROOT, "fixtures", "protected");
const OUT = join(ROOT, "results", "equivalence.json");
const BLA_DIST = join(ROOT, "upstream", "bla", "dist");
const { unpackAsarBuffer } = await import(join(BLA_DIST, "shields/formats/asar.js"));

const sha = (b) => createHash("sha256").update(b).digest("hex");
const read = (p) => readFileSync(p);
const results = {};
const ASAR_TMP = mkdtempSync(join(tmpdir(), "counter-rea-"));

const nodeRun = (code) => {
  const cmd = process.env.NODE_BIN ?? "npx";
  const args = process.env.NODE_BIN ? ["-e", code] : ["-y", "node@24.22.1", "-e", code];
  const r = spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  return { exit: r.status, stdout: r.stdout.trim(), stderr: r.stderr.trim() };
};

{
  const code = `
    const a = require(${JSON.stringify(join(SRC, "app", "license.js"))});
    const b = require(${JSON.stringify(join(PROT, "js-app", "license.js"))});
    const vs = [["ENT-ABC","prod",123],["ENT-XYZ","prod",0],["BAD","prod",1],["ENT-","prod",4294967295]];
    const out = vs.map(v => [a.validateLicense(...v), b.validateLicense(...v)]);
    const same = out.every(([x,y]) => JSON.stringify(x) === JSON.stringify(y));
    console.log(JSON.stringify({ same, lease: [a.issueLease("acct_1",30), b.issueLease("acct_1",30)], out }));
  `;
  results.js = nodeRun(code);
  try { results.js.parsed = JSON.parse(results.js.stdout); } catch {}
}

{
  const orig = unpackAsarBuffer(read(join(SRC, "app.asar")));
  const prot = unpackAsarBuffer(read(join(PROT, "app.asar")));
  const origMap = new Map(orig.map((f) => [f.relativePath, f.content]));
  const protMap = new Map(prot.map((f) => [f.relativePath, f.content]));
  const preserved = [...origMap].map(([p, c]) => ({ path: p, present: protMap.has(p), same: protMap.has(p) && sha(protMap.get(p)) === sha(c) }));
  results.asar = { original_members: orig.length, protected_members: prot.length, preserved, all_preserved: preserved.every((p) => p.same) };
  if (protMap.has("license.js")) {
    const asarRuntime = join(ASAR_TMP, "asar-prot-license.js");
    writeFileSync(asarRuntime, protMap.get("license.js"));
    results.asar.runtime = nodeRun(`const m = require(${JSON.stringify(asarRuntime)}); console.log(JSON.stringify(m.validateLicense("ENT-ABC","prod",123)));`);
  }
}

{
  const code = `
    (async () => {
      const fs = require("node:fs");
      const a = await WebAssembly.instantiate(fs.readFileSync(${JSON.stringify(join(SRC, "module.wasm"))}));
      const b = await WebAssembly.instantiate(fs.readFileSync(${JSON.stringify(join(PROT, "module.wasm"))}));
      const ea = Object.keys(a.instance.exports), eb = Object.keys(b.instance.exports);
      const out = [];
      for (const [x,y] of [[1,2],[0xffffffff,0x12345678],[0,0]]) {
        let ra, rb, err;
        try { ra = a.instance.exports.computeDigest(x,y); } catch (e) { err = String(e); }
        try { rb = b.instance.exports.computeDigest(x,y); } catch (e) { err = String(e); }
        out.push({x,y,ra,rb,same:ra===rb});
      }
      console.log(JSON.stringify({ea,eb,out,same:out.every(o=>o.same)}));
    })();
  `;
  results.wasm = nodeRun(code);
  try { results.wasm.parsed = JSON.parse(results.wasm.stdout); } catch {}
}

{
  const code = `
    const { DatabaseSync } = require("node:sqlite");
    const inspect = (p) => {
      const db = new DatabaseSync(p, { readOnly: true });
      const tables = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' ORDER BY name").all();
      let rows = null;
      try { rows = db.prepare("SELECT account_id, plan_tier, offline_token FROM license_cache ORDER BY account_id").all(); } catch (e) { rows = String(e); }
      db.close();
      return { tables, rows };
    };
    const a = inspect(${JSON.stringify(join(SRC, "license.sqlite"))});
    const b = inspect(${JSON.stringify(join(PROT, "license.sqlite"))});
    const core = (x) => (x.rows);
    console.log(JSON.stringify({a,b,sameRows: JSON.stringify(a.rows)===JSON.stringify(b.rows), extraTables: b.tables.map(t=>t.name).filter(n=>!a.tables.some(x=>x.name===n))}));
  `;
  results.sqlite = nodeRun(code);
  try { results.sqlite.parsed = JSON.parse(results.sqlite.stdout); } catch {}
}

{
  const run = (p) => {
    const r = spawnSync(p, ["ENT-ABC"], { encoding: "utf8" });
    return { exit: r.status, stdout: r.stdout.trim(), stderr: r.stderr.trim() };
  };
  const a = run(join(SRC, "native.elf"));
  const b = run(join(PROT, "native.elf"));
  results.elf = { original: a, protected: b, same: a.stdout === b.stdout && a.exit === b.exit };
  const hdr = (p) => spawnSync("readelf", ["-h", p], { encoding: "utf8" }).stdout.split("\n").filter((l) => /Entry point|Type:|Machine:/.test(l));
  results.elf.header = { original: hdr(join(SRC, "native.elf")), protected: hdr(join(PROT, "native.elf")) };
}

{
  const a = read(join(SRC, "Vault.evm"));
  const b = read(join(PROT, "Vault.evm"));
  results.evm = { original_len: a.length, protected_len: b.length, prefix_preserved: b.subarray(0, a.length).equals(a), appended_bytes: b.length - a.length };
}

{
  const a = readFileSync(join(SRC, "kernel.ptx"), "utf8");
  const b = readFileSync(join(PROT, "kernel.ptx"), "utf8");
  results.ptx = { original_len: a.length, protected_len: b.length, prefix_preserved: b.startsWith(a), appended_bytes: b.length - a.length };
}

{
  const parseSt = (buf) => {
    const n = Number(buf.readBigUInt64LE(0));
    const header = JSON.parse(buf.subarray(8, 8 + n).toString("utf8"));
    const data = buf.subarray(8 + n);
    return { header, data };
  };
  const a = parseSt(read(join(SRC, "weights.safetensors")));
  const b = parseSt(read(join(PROT, "weights.safetensors")));
  const keys = Object.keys(a.header).filter((k) => k !== "__metadata__");
  const tensorSame = keys.map((k) => ({ name: k, same: JSON.stringify(a.header[k]) === JSON.stringify(b.header[k]) }));
  results.safetensors = { tensorSame, dataSame: sha(a.data) === sha(b.data) };
}

{
  const parseGguf = (buf) => ({ magic: buf.subarray(0, 4).toString("latin1"), version: buf.readUInt32LE(4), tensorCount: Number(buf.readBigUInt64LE(8)), kvCount: Number(buf.readBigUInt64LE(16)) });
  results.gguf = { original: parseGguf(read(join(SRC, "model.gguf"))), protected: parseGguf(read(join(PROT, "model.gguf"))) };
}

{
  const py = `
import importlib.util, json
def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m
a = load(${JSON.stringify(join(SRC, "license.pyc"))}, "a")
b = load(${JSON.stringify(join(PROT, "license.pyc"))}, "b")
out = [(a.validate(*v), b.validate(*v)) for v in [("ENT-ABC","prod",123),("BAD","prod",1)]]
print(json.dumps({"out": out, "same": all(x==y for x,y in out)}))
`;
  const r = spawnSync("python3", ["-c", py], { encoding: "utf8" });
  results.pyc = { exit: r.status, stdout: r.stdout.trim(), stderr: r.stderr.trim() };
  try { results.pyc.parsed = JSON.parse(r.stdout); } catch {}
}

rmSync(ASAR_TMP, { recursive: true, force: true });
writeFileSync(OUT, JSON.stringify({ generated_at: new Date().toISOString(), results }, null, 2));
console.log(JSON.stringify(results, null, 2));
