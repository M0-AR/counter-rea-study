# Threat model and dual-use statement

## Defender

A software vendor ships an application containing JavaScript, WebAssembly,
native code, model weights, or configuration. The vendor wants to raise the
cost of automated reverse engineering without breaking normal execution. The
vendor can run BLA locally and can change build flags, but cannot control the
analyst’s tooling, model, context window, or query strategy.

## Attacker

An automated reverse-engineering agent with:
- local filesystem access to the shipped artifact;
- a REA installation with CLI and MCP transports;
- a fixed token/context budget per session;
- the ability to choose commands, fields, pages, and analyzer budgets;
- no ability to execute the protected program in the same process as the
  analyzer (except where the harness explicitly runs a functional check).

The attacker is **not** assumed to be an LLM with unlimited context. That is
the condition BLA targets. The attacker is assumed to be able to route around
a single analyzer path: choose a different REA command, raise a documented
budget, request a summary instead of full evidence, or select a narrower field
set. This is the “routing-around” behavior documented by Reveree and Quarkslab.

## Assets

- The vendor’s implementation details and embedded secrets (if any).
- The analyst’s time, tokens, money, and context window.
- The integrity of the vendor’s shipped behavior.

## Non-goals

- We do not evaluate confidentiality against a determined human reverse
  engineer with unlimited time.
- We do not evaluate runtime tampering, license bypass, or live debugging.
- We do not claim that token amplification equals reverse-engineering
  difficulty.
- We do not claim that a hard denial is a security boundary. A denial can be a
  usability failure or a routing signal.
- We do not test third-party or production software.

## Dual-use posture

The repository evaluates a published defense and uses only synthetic fixtures
created by its own scripts. It does not include a new packer, a new evasion
technique, or a weaponized artifact. The most reusable output is a measurement
protocol and a set of negative/conditional results: budget traps are
query-shaped, and a structural verifier can report success while the live
analyzer succeeds or fails independently.

## Ethical constraints

- No live malware, no third-party binaries, no leaked secrets.
- No exfiltration, no network exploitation, no persistence.
- No claim that a vendor “must” deploy a defense that breaks accessibility or
  users’ control over their own devices.
- Results are reported with exact commands and pinned versions so that
  disagreements can be reproduced rather than inferred.
