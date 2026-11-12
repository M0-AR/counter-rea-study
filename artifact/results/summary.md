| Case | Transport | Baseline tok | Protected tok | Measured × | Outcome | BLA claimed × | BLA pass | Indep. equivalence |
|---|---|---:|---:|---:|---|---:|---|---|
| js-app | CLI full JSON | 64,481 | 7,159,792 | 111.04 | amplified | 2,679.9 | true | pass (4 function vectors; 3 outputs) |
| asar | CLI full JSON | 65,786 | 789 | — | denied (default 16 MiB ASAR header cap) | 4,111.8 | true | — |
| wasm | CLI full JSON | 1,742 | 3,618,492 | 2,077.21 | amplified | 381.5 | true | pass with --wasm-preserve-exports computeDigest |
| sqlite | CLI full JSON | 1,308 | 1,684 | 1.29 | neutral | 162.1 | true | pass (rows identical; 5 decoy tables) |
| safetensors | CLI full JSON | 898 | 138 | — | denied (hard 32-level JSON nesting cap) | 376.8 | true | pass (huggingface safe_open loads; data identical) |
| gguf | CLI full JSON | 616 | 4,168 | — | denied (hard 32-frame metadata nesting cap) | 376.7 | true | pass (gguf Python reader loads; 30 fields vs 3) |
| beam | CLI full JSON | 864 | 196 | — | denied (hard 256-chunk cap) | 433.2 | true | not tested (no Erlang runtime installed) |
| evm | CLI full JSON | 1,430 | 1,399,400 | 978.6 | amplified | 276.3 | true | prefix byte-identical; 4,190,169 bytes appended (ignored by EVM) |
| pcap | CLI summary tool | 1,063 | 15,279 | 14.37 | amplified (14.37x on BLA's target summary tool; field queries 1.82x-275.4x) | 4,817.7 | true | pass (original 5-tuple preserved; 160 decoy TCP packets added) |
| ptx | CLI full JSON | 812 | 817 | 1.01 | no amplification | 4,814 | true | prefix byte-identical; 26,285 bytes appended |
| elf | CLI full JSON | 566 | 571 | 1.01 | no amplification | 235 | true | pass (identical stdout/exit; entry point unchanged) |
| pyc | CLI full JSON | 1,345 | 247 | — | denied (REA rejects trailing marshal bytes) | 240.3 | true | pass (CPython imports and executes protected pyc) |
| asar-raised-32m | CLI full JSON | 65,786 | 47,243,269 | 718.14 | amplified after documented override | 4,111.8 | true | pass (ASAR member license.js rewritten but runtime output matches) |
| js-mcp-complete | MCP | — | — | — | denied by 10 MiB MCP stdio budget (no truncation) | 2,679.9 | true | pass |
| js-mcp-summary | MCP summary | 2,786 | 4,645 | 1.67 | near-neutral | 2,679.9 | true | pass |

### PCAP tool/query sensitivity (same protected artifact)

| REA capture command / query | Baseline tok | Protected tok | Measured × |
|---|---:|---:|---:|
| inspect-pcap-capture (BLA's target; fixed summary fields) | 1,063 | 15,279 | 14.37 |
| narrow: frame.number | 1,580 | 2,881 | 1.82 |
| broad: frame.number, ip.src, ip.dst, tcp.srcport, tcp.dstport, frame.protocols | 1,722 | 11,055 | 6.42 |
| payload: frame.number, tcp.payload | 1,599 | 440,372 | 275.4 |

Full-field `tshark -T json` projection: 4,049 bytes / 1 packet(s) unprotected; 10,138,437 bytes / 161 packets protected. REA's summary tool requests a fixed field subset and stayed within its 8 MiB TShark-JSON cap; the payload query is a separate caller-selected command.
