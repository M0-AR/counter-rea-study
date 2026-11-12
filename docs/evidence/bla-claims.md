# BLA claim audit

Pinned source: `bla-agents 3.2.5` at commit `9c41bb53b040797e098954c4007425981f3a7a6b`.
All line references below are relative to `artifact/upstream/bla/` at that commit.
Machine-readable extracts are in `data/bla-evidence.json`,
`data/bla-self-validation.json`, `data/bla-benchmark-factors.json`, and
`data/bla-verify-factors.json`; regenerate them with
`node artifact/scripts/extract_bla_evidence.mjs`.

## 1. Four different claim surfaces

BLA does not expose one number for “how much does protection cost an analyzer?”
It exposes four surfaces that are often read as interchangeable:

| Surface | What it actually is | Source |
| --- | --- | --- |
| README narrative | A hand-maintained aggregate and a 14-row factor table | `README.md:228-247` |
| `bla benchmark` | A local 14-case run of BLA’s token estimator, with a separate “functional” check per case | `src/engine/benchmark.ts:280-760`; output in `data/raw/bla-benchmark.json` |
| `bla verify` | A structural self-check of BLA’s *simulated* REA invariants | `src/engine/verifier.ts:25-209`; outputs in `artifact/results/raw/*/bla.verify.json` |
| Empirical REA validation | BLA’s own live-REA probe for its own showcase fixtures | `docs/redteam/empirical-rea-validation.json`; extract in `data/bla-self-validation.json` |

Only the last surface runs live REA. The first three are estimates, structural
self-checks, or both.

## 2. README aggregate is not the benchmark aggregate

`README.md:230` claims:

> **~639.5×** token amplification · **~304.4×** cost amplification ·
> **14/14 bundled showcase targets** passed runtime-equivalence checks.

The same-commit `bla benchmark` output computes:

- aggregate token multiplier: **1067.3×**
- aggregate cost multiplier: **502.9×**

Across five repeated benchmark runs the aggregate ranged 1065.9–1067.3×
(mean 1067.02×) for tokens and 502.2–502.9× (mean 502.76×) for cost. The README aggregate is therefore about
40% lower than the benchmark it describes. It is also not derivable from the
README’s own rounded table: the rounded token totals imply 611.6×, the
arithmetic mean of the 14 rounded factors is 824.7×, and their geometric mean
is 458.3×.

The per-case factors disagree for 7 of 14 targets:

| Target | README | Same-commit benchmark |
| --- | ---: | ---: |
| DX-Ball JavaScript | 2822.7 | 3137.7 |
| License validator JavaScript | 2822.7 | 3172.7 |
| PTX | 500.2 | 4814 |
| PCAP | 333.2 | 4817.7 |
| DEX | 313.2 | 1510.5 |
| .NET DLL | 274.8 | 226.3 |
| Apple plist | 211.8 | 277.6 |

The other seven (ASAR, BEAM, WASM, safetensors, EVM, SQLite, ELF) match.
This is not a version-skew problem: the README, benchmark code, and benchmark
output are all from `bla-agents 3.2.5`.

## 3. “Runtime equivalence” is not tested by `bla verify`

`README.md:230` says 14/14 passed “runtime-equivalence checks,” and the table
header at `README.md:232` labels the column “Runtime Equivalence” with a
✅ 100% entry for every row. The verifier returns the opposite metadata:

- `overallPassed: passedCount === checks.length` (`src/engine/verifier.ts:185`)
- `verificationScope: "counter-rea-structural"` (`:186`)
- `runtimeEquivalence.status: "not-tested"` (`:187-190`)
- `functionalIntegrityVerified: false` (`:204-205`), with the source comment
  “Static parsing alone cannot establish executable functional equivalence.”

In all 12 formats we protected, `bla verify` returned `overallPassed: true`,
`functionalIntegrityVerified: false`, and `runtimeEquivalence.status:
"not-tested"` — including SQLite, PTX, and ELF, where live REA did not fail at
all. The verifier’s five checks are structural gates over
`auditTarget().reaSimulation` (`:34-109`); check 5 passes when the *estimated*
token multiplier is ≥10× or the estimated protected input is ≥80,000 tokens
(`:93-109`). It never invokes REA.

The benchmark’s `functionalCheckPassed` is a separate, mixed signal. It is not
a runtime-equivalence oracle:

| Kind | Cases | What the check does |
| --- | --- | --- |
| Executes original and protected code | JS (dx-ball, license), ASAR harness | Calls exported functions or an Electron clipboard harness and compares outputs (`benchmark.ts:289-301`, `:336-353`, `:365-381`) |
| Parses/validates protected artifact | SQLite, safetensors, DEX, BEAM, EVM, PCAP, PTX | Checks rows/integrity, tensor bytes, checksums, chunk tables, metadata, magic/prefix (`:451-481`, `:504-512`, `:533-540`, `:642-649`, `:668-674`, `:701-707`, `:735-741`) |
| Header/prefix only | ELF | Compares first 64 bytes and checks for a rustc-hash limit string; does not execute the binary (`:428-434`) |
| Explicit fallback | WASM | If the renamed export is absent, calls *any* exported function (`:400-413`) |

All 14 cases report `functionalCheckPassed: true`, which is consistent with
the README’s “100%” column. It is not consistent with calling that column
“runtime equivalence,” and it cannot support the claim that live REA was
functionally equivalent on all 14.

## 4. BLA’s own live-REA validation is credible but fixture-specific

`docs/redteam/empirical-rea-validation.json` records 13 live-REA pairs. It is
the most useful BLA evidence because it names the exact REA error or budget:

| BLA format | Before → after bytes | Live REA result in BLA’s own JSON |
| --- | ---: | --- |
| Go buildinfo | 51,339 → 1,214,461 | `BinaryResourceFailure`, `MAX_BUILD_INFO_BYTES` |
| Flutter pool | 51,339 → 1,214,461 | success; projected `MAX_POOL_URIS` / `MAX_POOL_TOKENS` cap |
| Erlang BEAM | 84 → 267,876 | `max_chunks` |
| EVM | 16 → 4,190,208 | success; approaches the 4 MiB input cap |
| PCAP | 24 → 1,347,772 | `TSHARK_JSON_MAX_BYTES` budget rejection |
| Safetensors | 128 → 10,160 | `MODEL_JSON_NESTING` |
| GGUF | 24 → 7,648 | `MODEL_METADATA_NESTING` |
| PTX | 91 → 26,424 | success; no budget hit |
| Electron ASAR | 607 → 17,752,989 | `DEFAULT_ASAR_MAX_HEADER_BYTES` |
| WASM | 54 → 6,877,425 | `WASM_INTERFACE_REPRESENTATION_BYTES` budget rejection |
| SQLite | 12,288 → 57,344 | `SqliteColumnEvaluationFailure` |
| Electron fuses | 51,339 → 1,214,461 | `ELECTRON_FUSE_LIMITS.maximumSentinelsPerSlice` |
| JavaScript | 761 → 116,210 | `alias-selections` + `getter-expansion` + `primitive-bytes` + `primitive-candidates` |

Two caveats:

1. These are BLA’s own fixtures, generated by BLA’s own case builders. They are
   not independently authored. The JSON’s `unverified` list includes Ghidra/Hopper, Frida, LLDB/GDB,
   Rizin/Cutter, JADX, the full EVMole worker, SPIR-V/CUDA/AMD objects, and
   firmware. The WASM WABT path was available in that run.
2. The JSON records budget hits and error names, not a full analysis-quality
   score. “Budget rejected” for JavaScript means REA reported semantic
   resource limits; it can still return evidence and exit successfully (see
   `rea-behavior.md`).

## 5. The self-check cannot distinguish success from failure

The strongest internal problem is discriminative validity. `bla verify`
returned `overallPassed: true` for every format, including:

- SQLite, where live REA’s default inventory succeeded at 1.29×;
- PTX, where live REA succeeded at 1.01×;
- ELF, where live REA succeeded at 1.01×.

The verifier is checking BLA’s own simulation counters (`triggeredResourceLimits`,
`decoyFunctionsDetectedAsReal`, `obligationLedgerNodes`,
`architecturalChaffPayloads`, and the estimator), not REA’s actual return code,
coverage, or evidence. A defender cannot use `overallPassed: true` as evidence
that an artifact will cost a live REA agent more.

## 6. What our independent experiment adds

We regenerate 12 minimal fixtures from source, protect them with the pinned BLA
CLI at `bankrupt` intensity, and run live REA with pinned versions. This tests
external validity, not a replay of BLA’s showcase. The outcomes differ by
format and by query shape:

| Outcome | Cases |
| --- | --- |
| Amplified at the default CLI path | JS 111.04×, WASM 2077.21× (preserve-exports), EVM 978.6×, PCAP summary tool 14.37× |
| Neutral at the default CLI path | SQLite 1.29×, PTX 1.01×, ELF 1.01× |
| Refused at the default CLI path | ASAR (16 MiB header), safetensors (32-level nesting), GGUF (32-frame nesting), BEAM (256-chunk cap), PYC (trailing marshal bytes) |
| Refusal converted to amplification | ASAR with `REA_ASAR_MAX_HEADER_BYTES=32 MiB`: 718.14× |

The interpretation is not “BLA is wrong everywhere.” It is that BLA’s factor
table is a property of a particular protected artifact and a particular
analyzer path, not a portable property of the format. The same protector can
produce a 2077× success, a 1.01× success, or a hard denial depending on the
fixture and the selected REA command. The next file documents the query-shape
dependence in REA.
