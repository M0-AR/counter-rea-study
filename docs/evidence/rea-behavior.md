# REA behavior relevant to BLA’s budget traps

Pinned source: `rea-agents 6.9.0` at commit
`d74549e495c58eb4a560279fd9f05508401ea0a0`. Line references are relative to
`artifact/upstream/rea/`.

The important distinction is between three different outcomes that BLA’s
literature sometimes collapses into “REA fails”:

1. **Semantic coverage degradation.** REA returns an evidence object and exits
   0, but some evaluation paths are marked unknown and `limitations` records a
   reached semantic budget.
2. **Hard resource denial.** REA refuses the request with an
   `AnalysisResourceConstraintError` (or a format-specific
   `*ResourceFailure`) before producing a complete result.
3. **Query-shaped cost.** The same file yields different token counts depending
   on which REA command and which fields are selected. This is not a format
   invariant.

## 1. Semantic budgets (JavaScript)

Defaults (`src/domain/javascript/javascriptSemanticPrecision.ts:4-12`):

| Control | Default |
| --- | ---: |
| `primitive_candidates` | 256 |
| `primitive_bytes` | 1,048,576 |
| `expression_depth` | 256 |
| `getter_expansions` | 512 |
| `alias_selections` | 512 |
| `wrapper_visits` | 1,000,000 |
| `wrapper_depth` | 128 |

The evaluator maps a reached budget to an explicit unknown value with a
remediation string (`src/domain/javascript/javascriptSemanticResourceLimits.ts:38-53`).
The limits are caller-adjustable through `semantic_precision` / 
`--semantic-precision` without a restart (`:52`).

Observed on our protected JavaScript fixture (Docker canonical):

- `inspect`/`analyze` returned exit 0 and 7,159,792 output tokens (111.04×).
- `limitations` still contained `alias-selections` and `getter-expansion`
  reached-budget messages.
- Therefore the correct description is “degraded coverage with a large evidence
  payload,” not “REA rejected the artifact.” BLA’s README empirical table marks
  JavaScript as “❌ Budget rejected” (`README.md:162`), which is stronger than
  what the live command returned.

## 2. ASAR header admission

- Default: 16 MiB (`src/domain/analysisResourceLimits.ts:7`).
- Maximum configurable: 256 MiB (`:15`).
- Environment override: `REA_ASAR_MAX_HEADER_BYTES`.
- Runtime override: MCP `update_analysis_settings` with
  `asar.max_header_bytes` (`src/artifacts/AsarHeader.ts:54`;
  `src/domain/analysisSettingDefinitions.ts:198-203`).

Observed:

| Artifact | Header size | Result |
| --- | ---: | --- |
| Protected ASAR, default | 18,023,350 B | exit 1, `truncated` |
| Protected ASAR, `REA_ASAR_MAX_HEADER_BYTES=32 MiB` | 18,023,350 B | exit 0, 47,243,269 tokens, 718.14× |

This is the cleanest example of a denial that a documented override converts
into amplification. BLA’s README only claims a 16.9 MiB capacity error
(`README.md:159`); it does not discuss the override.

## 3. Hard model/BEAM/PYC limits

| Limit | Value | Source | Runtime override? |
| --- | ---: | --- | --- |
| Safetensors JSON nesting | 32 | `src/model/ModelFormat.ts:53`, `src/model/SafetensorsHeader.ts:74-77` | No (`modelCapacityRemediation`, `:55-84`) |
| GGUF metadata nesting | 32 array frames | `src/model/ModelFormat.ts:52` | No |
| Model header | 100,000,000 B | `src/model/ModelFormat.ts:49` | No |
| Model report | 32 MiB | `src/model/ModelFormat.ts:50` | No |
| BEAM chunks, default | 64 | `src/domain/erlang/beam.ts:30-38` | Caller can raise to 256 |
| BEAM chunks, hard ceiling | 256 | `src/domain/erlang/beam.ts:12` | No |
| BEAM atoms, hard ceiling | 65,536 | `src/domain/erlang/beam.ts:14` | No |
| PYC trailing marshal bytes | rejected | `src/python/PythonPycParser.ts:262-264` | No |

Observed:

- Safetensors: 138 tokens, exit 1, `resource_constraint`.
- GGUF: 4,168 tokens, exit 1, `resource_constraint`.
- BEAM: 196 tokens, exit 1, `resource_constraint`; the protected form exceeds
  both the default 64-chunk budget and the legal 256-chunk ceiling.
- PYC: 247 tokens, exit 1, `invalid_request`; CPython still imports and
  executes the protected file because Python ignores the appended bytes.

The README’s “64-chunk budget” (`README.md:156`, `:211`) is accurate for the
default, but the code’s hard ceiling is 256. A protected BEAM that exceeds 256
chunks cannot be inspected even after raising the caller budget.

## 4. WASM representation budget

- `WASM_INTERFACE_REPRESENTATION_BYTES` default: 32 MiB
  (`src/domain/wasm/wasmInterface.ts:91`).
- Separate WABT input/output defaults: 8 MiB / 32 MiB
  (`src/domain/wasm/wasmArtifact.ts:35-39`).
- The interface representation budget is caller-adjustable up to the runtime
  string ceiling (`wasmInterface.ts:92-101`), but the WABT output budget is a
  separate producer limit.

Observed:

- Our protected WASM: 6,879,942 B input, 21,541,018 B REA JSON, exit 0,
  3,618,492 tokens (2077.21×). The representation is below 32 MiB.
- BLA’s own protected WASM: 6,877,425 B input, reported as
  `WASM_INTERFACE_REPRESENTATION_BYTES` budget rejection
  (`docs/redteam/empirical-rea-validation.json`). A 2.5 KB difference in the
  protected module is enough to cross the representation threshold.

This is a near-threshold effect, not a stable format property.

## 5. PCAP: two commands, two limits

REA exposes two different packet-capture operations:

### `inspect-pcap-capture` (BLA’s target)

- CLI registration: `src/cli/pcapCommands.ts:53-70`.
- Fixed field projection: `src/pcap/PcapProvider.ts:73-97`.
- TShark invocation: `-T json --no-duplicate-keys -e <fixed fields>`
  (`PcapProvider.ts:1076-1085`).
- 8 MiB cap on the TShark JSON stream: `PcapProvider.ts:1086`,
  `src/pcap/PcapOutput.ts:14`, enforced at `PcapOutput.ts:173-180`.

Observed on our protected capture:

- Summary tool: 1,063 → 15,279 tokens (14.37×), exit 0.
- Full `tshark -T json` dump: 4,049 → 10,138,437 B; the full dump exceeds
  8 MiB, but REA’s fixed projection does not materialize that dump.
- File growth: 94 → 1,346,404 B (14,323×).

### `inspect-packet-capture` (caller-selected fields)

- CLI registration: `src/cli/captureCommands.ts:92-159`.
- `fields` array (1–1024 entries), `display_filter`, `packet_limit`,
  `match_limit` default 50 (`src/domain/captures/packetCapture.ts:17-65`).
- This path returns caller-selected field rows, not the full protocol tree.

Observed token counts on the same protected capture:

| Query | Baseline | Protected | Ratio |
| --- | ---: | ---: | ---: |
| `frame.number` only | 1,580 | 2,881 | 1.82× |
| six broad fields | 1,722 | 11,055 | 6.42× |
| `frame.number` + `tcp.payload` | 1,599 | 440,372 | 275.4× |

The BLA claim “PCAP budget rejected” is true for a full-JSON path that exceeds
8 MiB, but not for the fixed summary projection or a narrow field query. The
cost is a function of the query, not just the capture size.

## 6. SQLite: the trap needs a column read

- Default compact inventory lists tables without reading columns.
- The trap tables are present in the protected database
  (`enclave_key_hierarchy`, `tpm2_attestation_ledger`, etc.).
- Selecting `enclave_key_hierarchy` or its `unsealed_preview` column triggers
  `SqliteColumnEvaluationFailure` because REA’s read-only connection does not
  load the application function `enclave_unseal_payload()`
  (`src/sqlite/SqliteDatabaseInspection.ts:840-850`).

Observed (host probe; Docker probe writes `results/sqlite_probe.json`):

| Request | Exit | Tokens | Result |
| --- | ---: | ---: | --- |
| Baseline, default inventory | 0 | 1,281 | success |
| Protected, default inventory | 0 | 1,575 | success, 1.23× |
| Protected, `--table enclave_key_hierarchy --row-limit 1` | 1 | 307 | `capability_unavailable` |
| Protected, `--column unsealed_preview` | 1 | 307 | `capability_unavailable` |

The trap is real, but conditional on the analyzer evaluating the trap column.
BLA’s README says SQLite is “❌ Redaction / eval trap” (`README.md:161`),
which is true for a deep column query but not for the default inventory.

## 7. MCP transport is a separate hard boundary

- `REA_MCP_MAX_RESPONSE_BYTES` floor: 10 MiB
  (`src/config/mcpResponseBudget.ts:9`, `:40-42`).
- Reserved single-string limit: Node’s `MAX_STRING_LENGTH - 1024` =
  536,869,864 UTF-16 code units; Node ceiling 536,870,888
  (`src/server/toolResultEncoding.ts:7-10`).
- These are separate from CLI output limits, and the MCP setting does not raise
  the string ceiling (`src/config/mcpResponseBudget.ts:17-33`).

Observed on the protected JavaScript fixture:

| Transport | Result |
| --- | --- |
| CLI full JSON | exit 0, 7,159,792 tokens |
| MCP `detail=complete` | exit 1, `resource_constraint`, response at least 10,577,078 B; evidence retained; no truncation |
| MCP `detail=summary` | exit 0, 4,645 tokens vs 2,786 unprotected (1.67×) |

The CLI-to-MCP-summary ratio is about 1,541×. A paper that reports only “tokens
after protection” without the transport is therefore under-specified.

## 8. Reproducing the probes

Host (Node 24.15 is too old for REA; scripts use `npx node@24.22.1`):

```bash
cd artifact
node scripts/run_matrix.mjs
node scripts/pcap_probe.mjs
node scripts/sqlite_probe.mjs
node scripts/mcp_probe.mjs
```

Container (canonical; includes TShark and `/usr/bin/time`):

```bash
cd artifact
docker compose build study
docker compose run --rm study
```

Canonical outputs: `results/summary.json`, `results/statistics.json`,
`results/pcap.json`, `results/sqlite_probe.json`,
`results/tokenizer_equivalence.json`, `results/env.container.json`.
