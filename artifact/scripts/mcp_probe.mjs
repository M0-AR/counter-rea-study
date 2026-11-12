#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import readline from "node:readline";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const REA = join(ROOT, "upstream", "rea");
const OUT = join(ROOT, "results", "mcp");
const [label, target, toolName, detail] = process.argv.slice(2);
if (!label || !target) {
  console.error("usage: mcp_probe.mjs <label> <path> [tool]");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });

const child = spawn(process.env.NODE_BIN ?? "npx", [...(process.env.NODE_BIN ? [] : ["-y", "node@24.22.1"]), "scripts/rea.mjs", "--mcp"], {
  cwd: REA,
  env: { ...process.env, REA_WABT_BIN_DIRECTORY: process.env.REA_WABT_BIN_DIRECTORY ?? "/tmp/opencode/wabt/bin" },
  stdio: ["pipe", "pipe", "pipe"],
});
const raw = createWriteStream(join(OUT, `${label}.stdout.jsonl`));
const err = createWriteStream(join(OUT, `${label}.stderr.txt`));
child.stderr.pipe(err);

const pending = new Map();
let nextId = 1;
const send = (method, params) => {
  const id = nextId++;
  const msg = { jsonrpc: "2.0", id, method, params };
  child.stdin.write(JSON.stringify(msg) + "\n");
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout ${method}`)), 180000);
    pending.set(id, { resolve, reject, timer, method });
  });
};
const notify = (method, params) => child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");

const rl = readline.createInterface({ input: child.stdout });
rl.on("line", (line) => {
  raw.write(line + "\n");
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (msg.id !== undefined && pending.has(msg.id)) {
    const p = pending.get(msg.id);
    clearTimeout(p.timer);
    pending.delete(msg.id);
    if (msg.error) p.reject(new Error(`${p.method}: ${JSON.stringify(msg.error).slice(0, 500)}`));
    else p.resolve(msg.result);
  }
});

const main = async () => {
  const init = await send("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "counter-rea-probe", version: "1.0.0" },
  });
  notify("notifications/initialized", {});
  const list = await send("tools/list", {});
  const tools = (list.tools ?? []).map((t) => ({ name: t.name, description: (t.description ?? "").slice(0, 160), input: t.inputSchema }));
  writeFileSync(join(OUT, `${label}.tools.json`), JSON.stringify({ server: init.serverInfo, tools }, null, 2));
  const chosen = toolName
    ? tools.find((t) => t.name === toolName)
    : tools.find((t) => /javascript.*application|analyze_javascript/i.test(t.name));
  if (!chosen) throw new Error(`tool not found; have ${tools.map((t) => t.name).join(",")}`);
  const callStart = Date.now();
  const props = chosen.input?.properties ?? {};
  const args = props.input_path ? { input_path: target } : props.path ? { path: target } : { input_path: target };
  if (detail) args.detail = detail;
  const result = await send("tools/call", { name: chosen.name, arguments: args });
  const elapsed = Date.now() - callStart;
  const text = JSON.stringify(result);
  writeFileSync(join(OUT, `${label}.call.json`), JSON.stringify({ tool: chosen.name, elapsed_ms: elapsed, result_bytes: Buffer.byteLength(text), isError: result.isError ?? false, result }, null, 2));
  console.log(JSON.stringify({ label, tool: chosen.name, elapsed_ms: elapsed, result_bytes: Buffer.byteLength(text), isError: result.isError ?? false, content_types: (result.content ?? []).map((c) => c.type), preview: text.slice(0, 600) }));
  child.kill("SIGTERM");
};

main().catch((e) => {
  console.error(String(e));
  child.kill("SIGTERM");
  process.exitCode = 1;
});
