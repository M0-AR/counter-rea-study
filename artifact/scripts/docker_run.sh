#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

git config --global --add safe.directory "*"

bash scripts/fetch_upstream.sh

for repo in bla rea; do
  if [ ! -d "upstream/$repo/node_modules" ]; then
    (cd "upstream/$repo" && npm ci)
  fi
done

(cd upstream/bla && npm run build)
(cd upstream/rea && npm run build:cached)

node scripts/make_fixtures.mjs
node scripts/run_baseline.mjs
node scripts/run_matrix.mjs
node scripts/run_variants.mjs
node scripts/intensity_sweep.mjs
node scripts/verify_equivalence.mjs
python3 scripts/check_models.py > results/model_equivalence.json
node scripts/pcap_probe.mjs
node scripts/sqlite_probe.mjs
node scripts/mcp_probe.mjs js-unprotected "$(pwd)/fixtures/src/app"
node scripts/mcp_probe.mjs js-protected "$(pwd)/fixtures/protected/js-app"
node scripts/mcp_probe.mjs js-unprotected-summary "$(pwd)/fixtures/src/app" analyze_javascript_application summary
node scripts/mcp_probe.mjs js-protected-summary "$(pwd)/fixtures/protected/js-app" analyze_javascript_application summary
node scripts/replications.mjs
node scripts/summarize.mjs
python3 scripts/tokenizer_check.py > results/tokenizer_equivalence.json
node scripts/statistics.mjs
ENV_OUT=results/env.container.json node scripts/provenance.mjs
node scripts/figures.mjs
