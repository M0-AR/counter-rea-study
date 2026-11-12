#!/usr/bin/env python3
import json
from pathlib import Path

from gguf import GGUFReader
from safetensors import safe_open

ROOT = Path(__file__).resolve().parent.parent
out = {}

for label, rel, opener in [
    ("safetensors_orig", "fixtures/src/weights.safetensors", "safetensors"),
    ("safetensors_prot", "fixtures/protected/weights.safetensors", "safetensors"),
]:
    path = ROOT / rel
    try:
        with safe_open(path, framework="numpy") as f:
            meta = f.metadata() or {}
            out[label] = {
                "keys": list(f.keys()),
                "metadata_keys": sorted(meta.keys()),
                "metadata_count": len(meta),
            }
    except Exception as exc:
        out[label] = {"error": f"{type(exc).__name__}: {exc}"}

for label, rel in [
    ("gguf_orig", "fixtures/src/model.gguf"),
    ("gguf_prot", "fixtures/protected/model.gguf"),
]:
    path = ROOT / rel
    try:
        reader = GGUFReader(path)
        out[label] = {
            "fields": len(reader.fields),
            "tensors": len(reader.tensors),
            "field_keys": sorted(reader.fields.keys()),
        }
    except Exception as exc:
        out[label] = {"error": f"{type(exc).__name__}: {exc}"}

print(json.dumps(out, indent=2))
