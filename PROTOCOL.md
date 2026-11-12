# Protocol and retrospective disclosure

## Status

This is a **retrospective empirical analysis**, not a preregistered study. The
repository was built after the author had already read BLA’s README, benchmark
code, verifier, and public discussion. No analysis plan was time-stamped before
data collection. To keep the work auditable, this file records the protocol
that was actually followed, the hypotheses that were tested, and every
departure from the initial plan.

## Research questions

- **RQ1 (durability):** When BLA’s protector is applied to independently
  authored fixtures, how much does live REA’s output cost grow at the default
  CLI path?
- **RQ2 (equivalence):** Does the protected artifact preserve observable
  behavior under an independent check, and what does BLA’s own verifier report
  about functional and runtime equivalence?
- **RQ3 (brittleness):** How do outcomes change with protector intensity,
  analyzer override settings, transport (CLI vs MCP), and query shape?
- **RQ4 (claim validity):** Are BLA’s published factors reproducible from its
  own same-commit benchmark, verifier, and live-REA validation surfaces?
- **RQ5 (defender economics):** Is the defender’s cost to apply protection
  lower than the attacker’s measured analysis cost, and under which
  conditions?

## Unit of analysis

A **case** is one source fixture, one BLA protection run at a stated intensity,
and one REA command with stated options. Cases are not independent samples from
a format population; they are deliberately small, readable probes that isolate
one mechanism at a time. We therefore report exact values and paired ratios,
not population inference.

## Inclusion and exclusion

Included formats: JavaScript app/directory, Electron ASAR, WebAssembly, SQLite,
safetensors, GGUF, Erlang BEAM, EVM bytecode, PCAP, PTX, ELF64, and CPython PYC.
They were chosen because BLA ships a protector and REA ships a matching
inspector, and because each maps to a different REA limit family.

Excluded: Android DEX, Apple plist, .NET DLL, Electron fuses, Flutter/Dart,
Go buildinfo, firmware, SPIR-V/CUDA/AMD objects, and live debugger paths. BLA’s
own validation also lists most of these as unverified or designed-for. We do
not claim results for formats we did not protect and inspect end to end.

## Measurement protocol

1. Pin BLA and REA to the commits in `artifact/scripts/fetch_upstream.sh`.
2. Regenerate fixtures deterministically with `make_fixtures.mjs`.
3. Run REA on the unprotected fixture (`baseline`).
4. Protect with BLA `bankrupt` intensity unless a variant is named.
5. Run the same REA command on the protected fixture.
6. Capture exit code, wall time, maximum RSS, output bytes, token count, and
   the full evidence JSON.
7. Run BLA `verify` on the protected fixture.
8. Run an independent functional/equivalence check where a runtime exists.
9. Repeat token-count runs three times for determinism checks.
10. Use the Docker run as canonical because it pins Node, TShark, WABT, and
    `/usr/bin/time`.

Token counts use REA’s own `--token-count` (the `tokenx` estimate REA reports).
A `cl100k_base` count is measured separately as a sensitivity check, not as the
primary metric. This choice is stated in advance of the sensitivity analysis:
REA’s reported unit is the quantity an agent would actually be charged in this
harness.

## Hypotheses and decision rules

- H1: BLA protection increases live REA token cost on at least half of the
  successful cases. **Supported** (5/8 successful CLI cases exceed 10×: JS
  111.04×, WASM 2077.21×, EVM 978.6×, PCAP 14.37×, and ASAR-after-override
  718.14×. Four of the seven default cases exceed 10×).
- H2: The published factor is a stable predictor across formats. **Not
  supported** (log-log slope 0.018, Spearman −0.048; measured factors range
  from 1.01× to 2077× while claimed factors cluster near 10²–10³).
- H3: BLA’s verifier establishes runtime equivalence. **Not supported**
  (`runtimeEquivalence: not-tested`, `functionalIntegrityVerified: false` on
  all 12 verified cases; the README’s “14/14” wording is stronger than the
  code).
- H4: A documented analyzer override converts denial into amplification.
  **Supported for ASAR** (16 MiB denial → 32 MiB override → 718.14×).
- H5: The same protected artifact has one stable cost. **Not supported**
  (PCAP summary 14.37×, broad fields 6.42×, payload fields 275.4×; SQLite
  default 1.29×, trap table `capability_unavailable`; JS CLI 7.16M tokens vs
  MCP summary 4,645).
- H6: The defender’s protection cost is lower than the measured attacker cost.
  **Partially supported** for the four amplified default cases and the ASAR
  override; **not supported** for the five hard-denial cases and the three
  neutral cases, where the attacker either pays little or is blocked without a
  token bill. We report the asymmetry rather than a single ROI number.

## Deviations from the initial plan

- The initial plan treated one tokenizer as the metric. After discovering that
  REA uses `tokenx` rather than an LLM tokenizer, we added a `cl100k_base`
  sensitivity check. The primary metric was not changed.
- The initial plan compared only claimed and measured factors. After finding
  that BLA’s own README, benchmark, and verifier disagree, we added a
  source-level claim audit (`docs/evidence/bla-claims.md`) and extracted
  machine-readable copies of BLA’s self-validation.
- The initial plan did not include an ASAR override variant. It was added
  after reading REA’s documented `asar.max_header_bytes` setting, because a
  denial that becomes a 718× amplification under a documented override is
  directly relevant to RQ3.
- The initial plan did not include an MCP transport comparison. It was added
  after observing that the CLI full JSON and the MCP summary are different
  products; reporting only one would be misleading.
- The initial plan used only the `bankrupt` preset. We added a four-intensity
  JavaScript/WASM sweep to test whether the primary row is an outlier; it is,
  for WASM, because the export-decoy flood appears only at `bankrupt`.
- No LLM API key was available. The agent-in-the-loop experiment (E6) remains
  design-only. No LLM behavior is inferred from token counts.

## Threats to validity

See `docs/limitations.md`. The main threats are fixture minimality, a single
protector version, a single REA version, path-length-dependent token counts,
and the absence of a live LLM agent. The paper reports exact case values and
does not treat the 12 fixtures as a random sample.

## Ethics and dual use

All artifacts are synthetic or public, generated locally. No third-party
software is protected or redistributed. The work evaluates a published
defense; it does not provide a new evasion tool. See `THREAT-MODEL.md`.
