# Measurements

## Canonical environment

The canonical run is the Docker image built by `artifact/docker/Dockerfile`:
Node 24.22.1, TShark 4.0.17, WABT 1.0.42, `tiktoken` with a pre-cached
`cl100k_base` encoding, and `/usr/bin/time`. Host runs use
`npx node@24.22.1` and are not canonical because host path lengths and
available tools differ.

Pinned upstreams:

- BLA `bla-agents 3.2.5`, commit `9c41bb53b040797e098954c4007425981f3a7a6b`.
- REA `rea-agents 6.9.0`, commit `d74549e495c58eb4a560279fd9f05508401ea0a0`.

## Primary metric

`tokens` is the integer printed by REA’s `--token-count`, which uses the
`tokenx` 1.3.0 `estimateTokenCount` path. It is the unit REA itself reports.
`ratio` is `protected_tokens / baseline_tokens` for the same command and
fixture. A ratio is reported only when both runs exit 0; when REA refuses, the
token count is the refusal payload and is not a cost ratio.

`cl100k_base` is a sensitivity metric (`results/tokenizer_equivalence.json`).
It answers “would a different token unit change the rank correlation?” It does
not replace the primary metric.

## Case table (Docker canonical)

| Case | Baseline tokens | Protected tokens | Ratio | Exit | Outcome |
| --- | ---: | ---: | ---: | ---: | --- |
| JavaScript app | 64,481 | 7,159,792 | 111.04× | 0 | amplified |
| WASM (preserve exports) | 1,742 | 3,618,492 | 2077.21× | 0 | amplified |
| SQLite | 1,308 | 1,684 | 1.29× | 0 | neutral |
| EVM | 1,430 | 1,399,400 | 978.6× | 0 | amplified |
| PCAP summary tool | 1,063 | 15,279 | 14.37× | 0 | amplified |
| PTX | 812 | 817 | 1.01× | 0 | neutral |
| ELF64 | 566 | 571 | 1.01× | 0 | neutral |
| ASAR (32 MiB override) | 65,786 | 47,243,269 | 718.14× | 0 | amplified after override |
| ASAR (default 16 MiB) | 65,786 | 789 | — | 1 | refused (`truncated`) |
| Safetensors | 898 | 138 | — | 1 | refused (`resource_constraint`) |
| GGUF | 616 | 4,168 | — | 1 | refused (`resource_constraint`) |
| BEAM | 864 | 196 | — | 1 | refused (`resource_constraint`) |
| PYC | 1,345 | 247 | — | 1 | refused (`invalid_request`) |
| JS via MCP `detail=complete` | — | — | — | 1 | refused (10 MiB MCP budget) |
| JS via MCP `detail=summary` | 2,786 | 4,645 | 1.67× | 0 | near-neutral |

The WASM row uses `--wasm-preserve-exports computeDigest`. Bankrupt
protection without that flag renames the public export; REA still succeeds (`exit 0`,
3,618,417 tokens), but the protected module is not ABI-compatible. The primary
comparison uses the preserve variant (3,618,492 tokens) so that both sides are
executable. This is stated wherever the factor is used.

The ASAR default row is a hard denial at REA’s 16 MiB header cap. The override
row is the same protected file with `REA_ASAR_MAX_HEADER_BYTES=32 MiB`.

## Statistics (8 successful CLI cases)

Order: `js-app`, `wasm`, `sqlite`, `evm`, `pcap`, `ptx`, `elf`,
`asar-raised-32m`.

- Claimed: `[2679.9, 381.5, 162.1, 276.3, 4817.7, 4814, 235, 4111.8]`
- Measured: `[111.04, 2077.21, 1.29, 978.6, 14.37, 1.01, 1.01, 718.14]`
- Pearson (raw): −0.3672
- Pearson (log10): **0.0393**
- Spearman: −0.0476
- Bootstrap 95% CI for log10 Pearson: [−0.8148, 0.7649]
- Log-log slope: **0.0181**, intercept 2.9732
- log10 RMSE, regression: 0.6119; zero model: 2.0385
- Geometric mean claimed: 1003.24×; measured: 36.38×
- Claimed / measured: JS 24.13, WASM 0.18, SQLite 125.66, EVM 0.28,
  PCAP 335.26, PTX 4766.34, ELF 232.67, ASAR 5.73

The sample is deliberately small and not a random sample. The correct reading
is “the published factor does not predict the measured factor in this sample,”
not “the true correlation is zero.”

## Tokenizer sensitivity

`cl100k_base` measured factors:
`[115.64, 3122.9, 1.28, 6732.32, 25.4, 1.05, 1.03, 549.44]`.
log10 Pearson **−0.0241**, Spearman 0.0476, log-log slope −0.0101, geometric
mean 51.17×.

The rank conclusion is unchanged. Individual factors move substantially:
EVM 978.6× → 6732.3×, WASM 2077.21× → 3122.9×, PCAP 14.37× → 25.4×,
ASAR 718.1× → 549.4×. This is why the paper reports both units and does not
treat any single factor as a universal constant.

## Intensity

| Intensity | JS tokens | JS ratio | WASM tokens | WASM ratio |
| --- | ---: | ---: | ---: | ---: |
| stealth | 2,481,573 | 38.49× | 4,773 | 2.74× |
| balanced | 3,824,471 | 59.31× | 6,806 | 3.91× |
| maximum | 5,876,681 | 91.14× | 11,615 | 6.67× |
| bankrupt | 7,381,143 | 114.47× | 3,618,503 | 2077.21× |

The bankrupt step multiplies the previous step by 1.26× for JavaScript and
311.54× for WASM. The WASM cliff is the export-decoy flood, not a smooth
intensity effect. All four JS variants and all four WASM variants remained
functional in the independent checks. The WASM sweep uses
`--wasm-preserve-exports computeDigest` at every intensity so that the
functional check exercises the same public ABI. The values differ slightly
from the primary bankruptcy row above (3,618,503 vs 3,618,492 tokens) because
the sweep uses separate output paths; the ratio is the same.

## Replication

Three repeated token-count runs:

| Case | Unique token values | Wall-clock range |
| --- | --- | --- |
| JS | 7,159,792 | 5,642–5,802 ms |
| WASM | 3,618,492 | 1,380–1,459 ms |
| EVM | 1,399,400 | 985–1,003 ms |

Token counts are deterministic; wall time varies by a few percent. These are
separate runs from the summary table, but the token values now match because
both use `--format json`.

## Path-length caveat

REA evidence includes absolute file paths. A long host checkout path (for
example `/home/<user>/src/counter-rea-study/artifact/...`) is longer than the
container path `/work/artifact/...`, so identical bytes can produce slightly
different token counts. Earlier host probes also omitted `--format json`, which changes output
shape: SQLite baseline was 1,281 host vs 1,308 Docker; protected 1,575 vs
1,684. The qualitative outcome is unchanged, but exact values in the paper use
the container run with `--format json`. This is a measurement limitation, not
an artifact difference.

## Data-quality notes

- `artifact/results/matrix.json` contains a stale PCAP row from the earlier
  host run (`capability_unavailable`). The canonical PCAP result is
  `results/pcap.json`, produced with TShark in Docker.
- `artifact/results/matrix.json` contains the default WASM row (`exit 0`,
  3,618,417 tokens; ABI-incompatible). The canonical WASM result is the
  preserve variant in `results/variants/variants.json` and `results/summary.json`.
- `results/equivalence.json` is large because it embeds evidence; it is
  git-ignored. The small `results/summary.json`, `results/statistics.json`,
  `results/pcap.json`, `results/sqlite_probe.json`, and
  `results/tokenizer_equivalence.json` are the citable summaries.
