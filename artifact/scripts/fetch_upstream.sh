#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

clone_at() {
  local url="$1" dir="$2" commit="$3"
  if [ ! -d "$dir/.git" ]; then
    git clone "$url" "$dir"
  fi
  git -C "$dir" fetch --tags --force origin
  git -C "$dir" checkout --detach "$commit"
}

clone_at https://github.com/qybaihe/bla.git \
  "$ROOT/upstream/bla" \
  9c41bb53b040797e098954c4007425981f3a7a6b

clone_at https://github.com/morluto/rea.git \
  "$ROOT/upstream/rea" \
  d74549e495c58eb4a560279fd9f05508401ea0a0

printf 'bla %s\n' "$(git -C "$ROOT/upstream/bla" rev-parse HEAD)"
printf 'rea %s\n' "$(git -C "$ROOT/upstream/rea" rev-parse HEAD)"
