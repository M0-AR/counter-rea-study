#!/usr/bin/env python3
import json
from pathlib import Path

try:
    import tiktoken
except Exception as exc:
    raise SystemExit(f"tiktoken unavailable: {exc}")

ROOT = Path(__file__).resolve().parent.parent
PAIRS = {
    "js-app": ("results/baseline/raw/js-app/rea.full.json", "results/raw/js-app/rea.full.json"),
    "wasm": ("results/variants/raw/wasm-baseline-fixed/rea.full.json", "results/variants/raw/wasm-fixed/rea.full.json"),
    "sqlite": ("results/baseline/raw/sqlite/rea.full.json", "results/raw/sqlite/rea.full.json"),
    "evm": ("results/baseline/raw/evm/rea.full.json", "results/raw/evm/rea.full.json"),
    "pcap": ("results/pcap/baseline.summary.full.json", "results/pcap/protected.summary.full.json"),
    "ptx": ("results/baseline/raw/ptx/rea.full.json", "results/raw/ptx/rea.full.json"),
    "elf": ("results/baseline/raw/elf/rea.full.json", "results/raw/elf/rea.full.json"),
    "asar-raised-32m": ("results/baseline/raw/asar/rea.full.json", "results/variants/raw/asar-raised-32m/rea.full.json"),
}

enc = tiktoken.get_encoding("cl100k_base")
cases = {}
for case_id, (baseline, protected) in PAIRS.items():
    baseline_path = ROOT / baseline
    protected_path = ROOT / protected
    if not baseline_path.exists() or not protected_path.exists():
        continue
    baseline_tokens = len(enc.encode(baseline_path.read_text(encoding="utf8")))
    protected_tokens = len(enc.encode(protected_path.read_text(encoding="utf8")))
    cases[case_id] = {
        "baseline_tokens": baseline_tokens,
        "protected_tokens": protected_tokens,
        "ratio": round(protected_tokens / baseline_tokens, 2),
        "baseline_path": baseline,
        "protected_path": protected,
    }

out = {
    "tokenizer": "cl100k_base",
    "tiktoken_version": tiktoken.__version__,
    "case_count": len(cases),
    "cases": cases,
}
target = ROOT / "results" / "tokenizer_equivalence.json"
target.write_text(json.dumps(out, indent=2) + "\n", encoding="utf8")
print(json.dumps(out, indent=2))
