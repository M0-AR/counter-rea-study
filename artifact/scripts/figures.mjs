#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const OUT = join(ROOT, "..", "figures");
const R = join(ROOT, "results");
const summary = JSON.parse(readFileSync(join(R, "summary.json"), "utf8"));
const stats = JSON.parse(readFileSync(join(R, "statistics.json"), "utf8"));
const tokenizer = JSON.parse(readFileSync(join(R, "tokenizer_equivalence.json"), "utf8"));
const benchmark = JSON.parse(readFileSync(join(ROOT, "..", "data", "raw", "bla-benchmark.json"), "utf8"));
const readme = JSON.parse(readFileSync(join(ROOT, "..", "data", "bla-readme-factors.json"), "utf8")).factors;
const pcap = JSON.parse(readFileSync(join(R, "pcap.json"), "utf8"));
mkdirSync(OUT, { recursive: true });

const W = (n) => Number(n.toFixed(2));
const esc = (s) => String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const text = (x, y, s, o = {}) =>
  `<text x="${W(x)}" y="${W(y)}" font-family="Inter, Helvetica, Arial, sans-serif" font-size="${o.size ?? 12}" fill="${o.fill ?? "#1a1a1a"}" text-anchor="${o.anchor ?? "start"}" font-weight="${o.weight ?? 400}" ${o.rotate ? `transform="rotate(${o.rotate} ${W(x)} ${W(y)})"` : ""}>${esc(s)}</text>`;
const line = (x1, y1, x2, y2, o = {}) =>
  `<line x1="${W(x1)}" y1="${W(y1)}" x2="${W(x2)}" y2="${W(y2)}" stroke="${o.stroke ?? "#333"}" stroke-width="${o.width ?? 1}" ${o.dash ? `stroke-dasharray="${o.dash}"` : ""}/>`;
const rect = (x, y, w, h, o = {}) =>
  `<rect x="${W(x)}" y="${W(y)}" width="${W(w)}" height="${W(h)}" fill="${o.fill ?? "#1f77b4"}" ${o.stroke ? `stroke="${o.stroke}"` : ""} ${o.rx ? `rx="${o.rx}"` : ""} opacity="${o.opacity ?? 1}"/>`;
const circle = (x, y, r, o = {}) =>
  `<circle cx="${W(x)}" cy="${W(y)}" r="${r}" fill="${o.fill ?? "#1f77b4"}" stroke="${o.stroke ?? "#fff"}" stroke-width="${o.sw ?? 1}"/>`;
const square = (x, y, s, o = {}) =>
  `<rect x="${W(x - s / 2)}" y="${W(y - s / 2)}" width="${s}" height="${s}" fill="${o.fill ?? "#d62728"}" stroke="${o.stroke ?? "#fff"}" stroke-width="${o.sw ?? 1}"/>`;
const triangle = (x, y, s, o = {}) =>
  `<path d="M ${W(x)} ${W(y - s / 2)} L ${W(x + s / 2)} ${W(y + s / 2)} L ${W(x - s / 2)} ${W(y + s / 2)} Z" fill="${o.fill ?? "#2ca02c"}" stroke="${o.stroke ?? "#fff"}" stroke-width="${o.sw ?? 1}"/>`;
const title = (s, y = 28, size = 18) => text(20, y, s, { size, weight: 700 });
const note = (s, y, size = 10) => text(20, y, s, { size, fill: "#555" });
const xlog = (v, x0, x1, lo, hi) => x0 + ((Math.log10(v) - lo) / (hi - lo)) * (x1 - x0);
const ylog = (v, y0, y1, lo, hi) => y1 - ((Math.log10(v) - lo) / (hi - lo)) * (y1 - y0);
const grid = (x0, x1, y0, y1, xs, ys, fx, fy) => {
  let out = "";
  for (const x of xs) out += line(fx(x), y0, fx(x), y1, { stroke: "#e6e6e6", width: 1 });
  for (const y of ys) out += line(x0, fy(y), x1, fy(y), { stroke: "#e6e6e6", width: 1 });
  return out;
};
const ticksX = (xs, fx, y, fmt = (x) => `${x}×`) => xs.map((x) => `${line(fx(x), y, fx(x), y + 5, { stroke: "#555" })}${text(fx(x), y + 18, fmt(x), { size: 10, anchor: "middle", fill: "#333" })}`).join("");
const ticksY = (ys, fy, x, fmt = (x) => `${x}×`) => ys.map((y) => `${line(x - 5, fy(y), x, fy(y), { stroke: "#555" })}${text(x - 8, fy(y) + 3, fmt(y), { size: 10, anchor: "end", fill: "#333" })}`).join("");

const svg = (w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img">${rect(0, 0, w, h, { fill: "#ffffff", rx: 0 })}${body}</svg>\n`;

const labelsTokenx = {
  "js-app": [7, -7, "start"],
  wasm: [7, 13, "start"],
  sqlite: [7, 11, "start"],
  evm: [7, 13, "start"],
  pcap: [7, 14, "start"],
  ptx: [7, 14, "start"],
  elf: [-7, -8, "end"],
  "asar-raised-32m": [7, 13, "start"],
};
const labelsCl = {
  "js-app": [7, -7, "start"],
  wasm: [7, 13, "start"],
  sqlite: [7, 11, "start"],
  evm: [-7, 3, "end"],
  pcap: [7, 14, "start"],
  ptx: [7, 14, "start"],
  elf: [-7, -8, "end"],
  "asar-raised-32m": [7, 13, "start"],
};

const claimedVsMeasured = () => {
  const w = 940, h = 560;
  const panels = [
    { x0: 80, x1: 440, lo: -0.05, hi: 3.4, label: "REA --token-count (tokenx)", measured: stats.claimed_vs_measured.measured, r: stats.claimed_vs_measured.pearson_log10, slope: stats.claimed_vs_measured.loglog_slope, labels: labelsTokenx },
    { x0: 530, x1: 890, lo: -0.05, hi: 3.9, label: "cl100k_base tokenizer", measured: stats.sample.ids.map((id) => tokenizer.cases[id].ratio), r: stats.claimed_vs_measured.tokenizer_sensitivity.pearson_log10, slope: stats.claimed_vs_measured.tokenizer_sensitivity.loglog_slope, labels: labelsCl },
  ];
  const y0 = 75, y1 = 420, ylo = 2.0, yhi = 3.8;
  let b = title("BLA's claimed amplification does not predict live measurement", 30, 19);
  b += note("Each point is one artifact family. Dashed line is y = x; dotted lines are 10× over- and under-prediction.", 50, 11);
  for (const p of panels) {
    b += text((p.x0 + p.x1) / 2, y1 + 44, p.label, { size: 12, anchor: "middle", weight: 600 });
    b += text((p.x0 + p.x1) / 2, y1 + 59, `log10 r = ${p.r.toFixed(3)} · slope = ${p.slope.toFixed(3)}`, { size: 10, anchor: "middle", fill: "#555" });
    b += `<rect x="${p.x0}" y="${y0}" width="${p.x1 - p.x0}" height="${y1 - y0}" fill="#fff" stroke="#bbb"/>`;
    b += grid(p.x0, p.x1, y0, y1, [1, 10, 100, 1000, 10000], [100, 1000, 10000], (v) => xlog(v, p.x0, p.x1, p.lo, p.hi), (v) => ylog(v, y0, y1, ylo, yhi));
    for (const f of [0.1, 1, 10]) {
      const pts = [];
      for (const v of [1, 10, 100, 1000, 10000]) {
        const yv = v * f;
        if (Math.log10(yv) >= ylo && Math.log10(yv) <= yhi) pts.push([xlog(v, p.x0, p.x1, p.lo, p.hi), ylog(yv, y0, y1, ylo, yhi)]);
      }
      if (pts.length > 1) b += line(pts[0][0], pts[0][1], pts[pts.length - 1][0], pts[pts.length - 1][1], { stroke: f === 1 ? "#555" : "#bbb", width: f === 1 ? 1.4 : 1, dash: f === 1 ? "6 4" : "2 4" });
    }
    b += ticksX([1, 10, 100, 1000, 10000], (v) => xlog(v, p.x0, p.x1, p.lo, p.hi), y1);
    if (p === panels[0]) b += ticksY([100, 1000], (v) => ylog(v, y0, y1, ylo, yhi), p.x0);
    const pts = stats.sample.ids.map((id, i) => ({ id, x: p.measured[i], y: stats.claimed_vs_measured.claimed[i] }));
    for (const pt of pts) {
      const px = xlog(pt.x, p.x0, p.x1, p.lo, p.hi), py = ylog(pt.y, y0, y1, ylo, yhi);
      if (px < p.x0 || px > p.x1 || py < y0 || py > y1) continue;
      const [dx, dy, anchor] = p.labels[pt.id] ?? [7, -7, "start"];
      b += circle(px, py, 4.2, { fill: "#1f5fa8" });
      b += text(px + dx, py + dy, pt.id.replace("-raised-32m", " (override)"), { size: 9, fill: "#1a1a1a", anchor });
    }
  }
  b += note("Sample: 8 successful CLI analyses. Claimed factors are BLA verify tokenAmplificationFactor; live factors are protected / unprotected evidence.", 545, 10);
  return svg(w, h, b);
};

const outcomes = () => {
  const w = 900, h = 690;
  const x0 = 235, x1 = 835, y0 = 65, y1 = 615;
  const lo = 0, hi = 5;
  const rows = summary.cases;
  const rowH = (y1 - y0) / rows.length;
  const fx = (v) => xlog(Math.max(1, v), x0, x1, lo, hi);
  let b = title("Live outcome by format: amplification, neutrality, or refusal", 30, 19);
  b += note("BLA bankrupt-intensity protection unless marked override. X is protected / unprotected tokens on REA's JSON evidence.", 50, 11);
  b += `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="#fff" stroke="#bbb"/>`;
  b += grid(x0, x1, y0, y1, [1, 10, 100, 1000, 10000, 100000], [], fx, () => 0);
  for (const v of [1, 10, 100, 1000, 10000, 100000]) b += text(fx(v), y1 + 18, `${v}×`, { size: 10, anchor: "middle", fill: "#333" });
  b += text((x0 + x1) / 2, y1 + 40, "Measured token amplification (log scale)", { size: 12, anchor: "middle", weight: 600 });
  b += line(fx(10), y0, fx(10), y1, { stroke: "#888", width: 1.1, dash: "4 4" });
  b += text(fx(10) + 4, y0 + 12, "10×", { size: 9, fill: "#666" });
  rows.forEach((r, i) => {
    const cy = y0 + rowH * (i + 0.5);
    const denied = r.token_ratio == null;
    const color = r.id === "asar-raised-32m" ? "#b26a00" : denied ? "#b3261e" : r.token_ratio >= 10 ? "#1b7f4b" : "#666";
    b += text(x0 - 12, cy + 3, r.id, { size: 10, anchor: "end", weight: 600 });
    b += text(x0 - 12, cy + 15, r.transport, { size: 8, anchor: "end", fill: "#777" });
    b += line(x0, cy, x1, cy, { stroke: "#f0f0f0", width: 1 });
    if (denied) {
      b += line(fx(1.15) - 4, cy - 4, fx(1.15) + 4, cy + 4, { stroke: color, width: 2 });
      b += line(fx(1.15) - 4, cy + 4, fx(1.15) + 4, cy - 4, { stroke: color, width: 2 });
      b += text(fx(1.35), cy + 3, r.id === "js-mcp-complete" ? "hard fail" : "denied", { size: 9, fill: color, weight: 600 });
      b += text(fx(1.35), cy + 14, r.protected_tokens == null ? "no result" : `${r.protected_tokens} error tok`, { size: 8, fill: "#777" });
    } else {
      b += line(x0, cy, fx(r.token_ratio), cy, { stroke: color, width: 5, opacity: 0.35 });
      b += circle(fx(r.token_ratio), cy, 4.2, { fill: color });
      b += text(fx(r.token_ratio) + 7, cy + 3, `${r.token_ratio.toLocaleString("en-US")}×`, { size: 9, fill: color, weight: 600 });
    }
  });
  b += `<circle cx="${x0 + 10}" cy="${y1 + 58}" r="4" fill="#1b7f4b"/><text x="${x0 + 20}" y="${y1 + 62}" font-family="Inter, Helvetica, Arial, sans-serif" font-size="10" fill="#333">amplified ≥10×</text>`;
  b += `<circle cx="${x0 + 115}" cy="${y1 + 58}" r="4" fill="#666"/><text x="${x0 + 125}" y="${y1 + 62}" font-family="Inter, Helvetica, Arial, sans-serif" font-size="10" fill="#333">neutral &lt;2×</text>`;
  b += `<circle cx="${x0 + 205}" cy="${y1 + 58}" r="4" fill="#b3261e"/><text x="${x0 + 215}" y="${y1 + 62}" font-family="Inter, Helvetica, Arial, sans-serif" font-size="10" fill="#333">refused at default</text>`;
  b += `<circle cx="${x0 + 330}" cy="${y1 + 58}" r="4" fill="#b26a00"/><text x="${x0 + 340}" y="${y1 + 62}" font-family="Inter, Helvetica, Arial, sans-serif" font-size="10" fill="#333">after documented override</text>`;
  return svg(w, h, b);
};

const factorSources = () => {
  const w = 940, h = 540;
  const x0 = 150, x1 = 850, y0 = 70, y1 = 475;
  const lo = 1.9, hi = 3.9;
  const ids = ["dx-ball", "notion-electron", "license-guard", "gpu-ptx", "erlang-beam", "wasm-core", "safetensors-model", "pcap-capture", "android-dex", "evm-bytecode", "dotnet-managed", "apple-plist", "sqlite-db", "native-elf"];
  const bench = new Map(benchmark.cases.map((c) => [c.id, c.tokenMultiplier]));
  const verifyId = { "dx-ball": null, "notion-electron": "asar", "license-guard": "js-app", "gpu-ptx": "ptx", "erlang-beam": "beam", "wasm-core": "wasm", "safetensors-model": "safetensors", "pcap-capture": "pcap", "android-dex": null, "evm-bytecode": "evm", "dotnet-managed": null, "apple-plist": null, "sqlite-db": "sqlite", "native-elf": "elf" };
  const verify = new Map(summary.cases.map((c) => [c.id, c.bla_claimed.token_factor]));
  const rowH = (y1 - y0) / ids.length;
  const fx = (v) => xlog(v, x0, x1, lo, hi);
  let b = title("Three BLA factor sources disagree on the same release", 30, 19);
  b += note("README, benchmark, and verify factors at 9c41bb5; verify points are shown for 10 measured targets.", 50, 11);
  b += `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="#fff" stroke="#bbb"/>`;
  b += grid(x0, x1, y0, y1, [100, 1000, 10000], [], fx, () => 0);
  for (const v of [100, 1000, 10000]) b += text(fx(v), y1 + 18, `${v}×`, { size: 10, anchor: "middle", fill: "#333" });
  b += text((x0 + x1) / 2, y1 + 40, "Token multiplier (log scale)", { size: 12, anchor: "middle", weight: 600 });
  ids.forEach((id, i) => {
    const cy = y0 + rowH * (i + 0.5);
    const vals = [readme[id], bench.get(id), verify.get(verifyId[id])].filter((v) => v != null);
    const min = Math.min(...vals), max = Math.max(...vals);
    b += text(x0 - 12, cy + 4, id, { size: 10, anchor: "end", weight: 600 });
    b += line(x0, cy, x1, cy, { stroke: "#f0f0f0" });
    b += line(fx(min), cy, fx(max), cy, { stroke: "#aaa", width: 2 });
    if (readme[id] != null) b += circle(fx(readme[id]), cy, 4.2, { fill: "#1f5fa8" });
    if (bench.get(id) != null) b += square(fx(bench.get(id)), cy, 7, { fill: "#d62728" });
    if (verify.get(verifyId[id]) != null) b += triangle(fx(verify.get(verifyId[id])), cy, 8, { fill: "#2ca02c" });
  });
  b += `<circle cx="${x0 + 10}" cy="${y1 + 58}" r="4" fill="#1f5fa8"/><text x="${x0 + 20}" y="${y1 + 62}" font-family="Inter, Helvetica, Arial, sans-serif" font-size="10" fill="#333">README table</text>`;
  b += `<rect x="${x0 + 120}" y="${y1 + 54}" width="7" height="7" fill="#d62728"/><text x="${x0 + 132}" y="${y1 + 62}" font-family="Inter, Helvetica, Arial, sans-serif" font-size="10" fill="#333">benchmark output</text>`;
  b += `<path d="M ${x0 + 245} ${y1 + 54} L ${x0 + 249} ${y1 + 62} L ${x0 + 241} ${y1 + 62} Z" fill="#2ca02c"/><text x="${x0 + 255}" y="${y1 + 62}" font-family="Inter, Helvetica, Arial, sans-serif" font-size="10" fill="#333">verify</text>`;
  return svg(w, h, b);
};

const transport = () => {
  const w = 940, h = 500;
  const js = summary.cases.find((c) => c.id === "js-app");
  const mcp = summary.mcp;
  const pcapSummary = pcap.summary_tool;
  const panels = [
    {
      x0: 105, x1: 445, title: "JavaScript app",
      rows: [
        { label: "CLI full JSON", tokens: js.protected_tokens, ratio: `${js.token_ratio.toFixed(2)}× vs baseline` },
        { label: "MCP summary", tokens: mcp.summary.protected_tokens, ratio: `${(mcp.summary.protected_tokens / mcp.summary.unprotected_tokens).toFixed(2)}× vs baseline` },
        { label: "MCP complete", fail: true, note: "≥10 MiB response; no result" },
      ],
    },
    {
      x0: 555, x1: 895, title: "PCAP summary vs field queries",
      rows: [
        { label: "summary tool", tokens: pcapSummary.protected.tokens, ratio: `${(pcapSummary.protected.tokens / pcapSummary.baseline.tokens).toFixed(2)}×` },
        { label: "fields: narrow", tokens: pcap.profiles.narrow.protected.tokens, ratio: `${(pcap.profiles.narrow.protected.tokens / pcap.profiles.narrow.baseline.tokens).toFixed(2)}×` },
        { label: "fields: broad", tokens: pcap.profiles.broad.protected.tokens, ratio: `${(pcap.profiles.broad.protected.tokens / pcap.profiles.broad.baseline.tokens).toFixed(2)}×` },
        { label: "fields: payload", tokens: pcap.profiles.payload.protected.tokens, ratio: `${(pcap.profiles.payload.protected.tokens / pcap.profiles.payload.baseline.tokens).toFixed(2)}×` },
      ],
    },
  ];
  const lo = 3, hi = 7;
  const y0 = 92, y1 = 405;
  let b = title("Transport and query choice change the measured cost", 30, 19);
  b += note("Same protected JavaScript app (left) and same protected PCAP (right); bars are tokens on the emitted evidence.", 50, 11);
  for (const p of panels) {
    const px = (v) => xlog(v, p.x0, p.x1, lo, hi);
    b += text((p.x0 + p.x1) / 2, y0 - 24, p.title, { size: 12, anchor: "middle", weight: 600 });
    b += `<rect x="${p.x0}" y="${y0}" width="${p.x1 - p.x0}" height="${y1 - y0}" fill="#fff" stroke="#bbb"/>`;
    b += grid(p.x0, p.x1, y0, y1, [1000, 10000, 100000, 1000000, 10000000], [], px, () => 0);
    for (const v of [1000, 10000, 100000, 1000000, 10000000]) b += text(px(v), y1 + 18, v === 1000 ? "1k" : v === 10000 ? "10k" : v === 100000 ? "100k" : v === 1000000 ? "1M" : "10M", { size: 10, anchor: "middle", fill: "#333" });
    const rh = (y1 - y0) / p.rows.length;
    p.rows.forEach((r, i) => {
      const cy = y0 + rh * (i + 0.5);
      b += text(p.x0 - 10, cy + 3, r.label, { size: 10, anchor: "end", weight: 600 });
      if (r.fail) {
        b += line(p.x0 + 2, cy, p.x1 - 2, cy, { stroke: "#b3261e", width: 3, dash: "4 4" });
        b += text(p.x0 + 8, cy - 9, r.note, { size: 9, fill: "#b3261e" });
      } else {
        const near = px(r.tokens) > p.x1 - 145;
        b += line(p.x0, cy, px(r.tokens), cy, { stroke: "#1f5fa8", width: 12, opacity: 0.35 });
        b += circle(px(r.tokens), cy, 4, { fill: "#1f5fa8" });
        b += text(px(r.tokens) + (near ? -7 : 7), cy + (near ? -9 : 3), `${r.tokens.toLocaleString("en-US")} tok · ${r.ratio}`, { size: 9, fill: "#1a1a1a", anchor: near ? "end" : "start" });
      }
    });
  }
  b += note("MCP complete is a hard error at REA's 10 MiB stdio budget; the evidence is retained, not truncated. No runtime override exists.", 462, 10);
  return svg(w, h, b);
};

for (const [name, fn] of Object.entries({
  "fig1-factor-sources.svg": factorSources,
  "fig2-outcomes.svg": outcomes,
  "fig3-transport.svg": transport,
  "fig4-claimed-vs-measured.svg": claimedVsMeasured,
})) {
  writeFileSync(join(OUT, name), fn());
  console.log(join(OUT, name));
}
