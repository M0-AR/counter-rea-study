#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const SRC = join(ROOT, "fixtures", "src");
const BLA_DIST = join(ROOT, "upstream", "bla", "dist");

const { packAsarBuffer } = await import(join(BLA_DIST, "shields/formats/asar.js"));
const { buildSampleSqliteDatabase } = await import(join(BLA_DIST, "shields/formats/sqlite.js"));
const { buildSafetensorsBuffer } = await import(join(BLA_DIST, "shields/formats/model.js"));

rmSync(SRC, { recursive: true, force: true });
mkdirSync(SRC, { recursive: true });
mkdirSync(join(SRC, "app"), { recursive: true });

const licenseJs = `function checksum(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function validateLicense(key, product, expected) {
  if (!key || !key.startsWith("ENT-")) return { valid: false, tier: "none" };
  const actual = checksum(key + ":" + product + ":enterprise-v4");
  const valid = actual === (expected >>> 0);
  return { valid, tier: valid ? "enterprise-unlimited" : "invalid", checksum: actual };
}

function issueLease(accountId, days) {
  const base = checksum(accountId + ":lease");
  return { accountId, days, lease: base.toString(16).padStart(8, "0") };
}

module.exports = { checksum, validateLicense, issueLease };
`;

const packageJson = JSON.stringify({ name: "counter-rea-fixture", version: "1.0.0", main: "license.js" }, null, 2) + "\n";

writeFileSync(join(SRC, "app", "license.js"), licenseJs);
writeFileSync(join(SRC, "app", "package.json"), packageJson);

writeFileSync(
  join(SRC, "app.asar"),
  packAsarBuffer([
    { relativePath: "package.json", content: Buffer.from(packageJson) },
    { relativePath: "license.js", content: Buffer.from(licenseJs) },
  ]),
);

writeFileSync(
  join(SRC, "module.wasm"),
  Buffer.from([
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
    0x01, 0x07, 0x01, 0x60, 0x02, 0x7f, 0x7f, 0x01, 0x7f,
    0x03, 0x02, 0x01, 0x00,
    0x07, 0x11, 0x01, 0x0d,
    0x63, 0x6f, 0x6d, 0x70, 0x75, 0x74, 0x65, 0x44, 0x69, 0x67, 0x65, 0x73, 0x74,
    0x00, 0x00,
    0x0a, 0x0c, 0x01, 0x0a, 0x00, 0x20, 0x00, 0x20, 0x01, 0x73, 0x41, 0x2a, 0x6a, 0x0b,
  ]),
);

writeFileSync(join(SRC, "license.sqlite"), buildSampleSqliteDatabase());

writeFileSync(
  join(SRC, "weights.safetensors"),
  buildSafetensorsBuffer(
    {
      __metadata__: { format: "pt", license: "apache-2.0" },
      "model.embed.weight": { dtype: "F32", shape: [2, 2], data_offsets: [0, 16] },
    },
    Buffer.alloc(16, 0),
  ),
);

const gguf = Buffer.alloc(32);
gguf.write("GGUF", 0, "ascii");
gguf.writeUInt32LE(3, 4);
gguf.writeBigUInt64LE(0n, 8);
gguf.writeBigUInt64LE(0n, 16);
writeFileSync(join(SRC, "model.gguf"), gguf);

const chunk = (name, body) => {
  const pad = (4 - (body.length % 4)) % 4;
  const hdr = Buffer.alloc(8);
  hdr.write(name, 0, "latin1");
  hdr.writeUInt32BE(body.length, 4);
  return Buffer.concat([hdr, body, Buffer.alloc(pad)]);
};
const atomNames = ["bench_mod", "module_info", "start"];
const atomParts = [Buffer.alloc(4)];
atomParts[0].writeUInt32BE(atomNames.length);
for (const n of atomNames) {
  const enc = Buffer.from(n, "utf8");
  atomParts.push(Buffer.from([enc.length]), enc);
}
const codeBody = Buffer.alloc(20);
codeBody.writeUInt32BE(16, 0);
codeBody.writeUInt32BE(0, 4);
codeBody.writeUInt32BE(169, 8);
codeBody.writeUInt32BE(4, 12);
codeBody.writeUInt32BE(2, 16);
const expBody = Buffer.alloc(16);
expBody.writeUInt32BE(1, 0);
expBody.writeUInt32BE(2, 4);
expBody.writeUInt32BE(0, 8);
expBody.writeUInt32BE(1, 12);
const form = Buffer.concat([
  Buffer.from("BEAM", "latin1"),
  chunk("AtU8", Buffer.concat(atomParts)),
  chunk("Code", codeBody),
  chunk("ExpT", expBody),
]);
const size = Buffer.alloc(4);
size.writeUInt32BE(form.length);
writeFileSync(join(SRC, "guard.beam"), Buffer.concat([Buffer.from("FOR1", "latin1"), size, form]));

const origEvm = Buffer.from(
  "60806040523615601b5760003560e01c806367e408a7146020575b005b602a60005260206000f3",
  "hex",
);
writeFileSync(join(SRC, "Vault.evm"), origEvm);

const pcapHdr = Buffer.alloc(24);
pcapHdr.writeUInt32LE(0xa1b2c3d4, 0);
pcapHdr.writeUInt16LE(2, 4);
pcapHdr.writeUInt16LE(4, 6);
pcapHdr.writeUInt32LE(65535, 16);
pcapHdr.writeUInt32LE(1, 20);
const checksum16 = (buf) => {
  let sum = 0;
  for (let i = 0; i < buf.length; i += 2) sum += (buf[i] << 8) + buf[i + 1];
  while (sum >> 16) sum = (sum & 0xffff) + (sum >> 16);
  return ~sum & 0xffff;
};
const eth = Buffer.alloc(14);
Buffer.from([0x02, 0, 0, 0, 0, 2]).copy(eth, 0);
Buffer.from([0x02, 0, 0, 0, 0, 1]).copy(eth, 6);
eth.writeUInt16BE(0x0800, 12);
const ip = Buffer.alloc(20);
ip[0] = 0x45;
ip.writeUInt16BE(40, 2);
ip.writeUInt16BE(1, 4);
ip.writeUInt16BE(0x4000, 6);
ip[8] = 64;
ip[9] = 6;
ip.writeUInt32BE(0x0a000001, 12);
ip.writeUInt32BE(0x0a000002, 16);
ip.writeUInt16BE(checksum16(ip), 10);
const tcp = Buffer.alloc(20);
tcp.writeUInt16BE(40000, 0);
tcp.writeUInt16BE(80, 2);
tcp.writeUInt32BE(1, 4);
tcp[12] = 0x50;
tcp[13] = 0x02;
tcp.writeUInt16BE(64240, 14);
const appFrame = Buffer.concat([eth, ip, tcp]);
const recHdr = Buffer.alloc(16);
recHdr.writeUInt32LE(1700000000, 0);
recHdr.writeUInt32LE(125000, 4);
recHdr.writeUInt32LE(appFrame.length, 8);
recHdr.writeUInt32LE(appFrame.length, 12);
writeFileSync(join(SRC, "traffic.pcap"), Buffer.concat([pcapHdr, recHdr, appFrame]));

writeFileSync(
  join(SRC, "kernel.ptx"),
  [
    ".version 7.5",
    ".target sm_70",
    ".address_size 64",
    "",
    ".visible .entry real_kernel(.param .u64 real_kernel_param_0)",
    "{",
    "  .reg .b64 %rd<3>;",
    "  .reg .f32 %f<3>;",
    "  ld.param.u64 %rd1, [real_kernel_param_0];",
    "  ld.global.f32 %f1, [%rd1];",
    "  add.f32 %f2, %f1, 0f3F800000;",
    "  st.global.f32 [%rd1], %f2;",
    "  ret;",
    "}",
    "",
  ].join("\n"),
);

writeFileSync(
  join(SRC, "native.c"),
  `#include <stdio.h>
static unsigned checksum(const char *s){unsigned h=2166136261u;for(;*s;s++){h^=(unsigned char)*s;h*=16777619u;}return h;}
int main(int argc,char**argv){const char*k=argc>1?argv[1]:"ENT-0000";printf("%u\\n",checksum(k));return 0;}
`,
);
execFileSync("gcc", ["-O2", "-s", "-o", join(SRC, "native.elf"), join(SRC, "native.c")], { stdio: "pipe" });

writeFileSync(
  join(SRC, "license.py"),
  `def checksum(s: str) -> int:
    h = 0x811C9DC5
    for ch in s:
        h ^= ord(ch)
        h = (h * 0x01000193) & 0xFFFFFFFF
    return h

def validate(key: str, product: str, expected: int) -> bool:
    return checksum(f"{key}:{product}:enterprise-v4") == expected
`,
);
execFileSync("python3", ["-c", `import py_compile; py_compile.compile(${JSON.stringify(join(SRC, "license.py"))}, cfile=${JSON.stringify(join(SRC, "license.pyc"))}, doraise=True)`], { stdio: "pipe" });

console.log(JSON.stringify({ ok: true, src: SRC }, null, 2));
