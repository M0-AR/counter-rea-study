.PHONY: help setup fixtures baseline matrix variants intensity equivalence models pcap sqlite mcp replications summary statistics figures docker clean

help:
	@printf '%s\n' \
	  'make setup        fetch pinned BLA/REA and install dependencies' \
	  'make fixtures     regenerate the 12 source fixtures' \
	  'make baseline     run REA on unprotected fixtures' \
	  'make matrix       run BLA protect + live REA + BLA verify' \
	  'make variants     run ASAR override and WASM preserve variants' \
	  'make intensity    run the four-intensity JS/WASM sweep' \
	  'make equivalence  run functional/equivalence checks' \
	  'make models       run safetensors/GGUF load checks' \
	  'make pcap         run PCAP summary and field-query probes' \
	  'make replications  repeat JS/WASM/EVM token measurements three times' \
	  'make sqlite       run SQLite default/trap probes' \
	  'make mcp          run MCP complete/summary probes' \
	  'make summary      rebuild summary.json and summary.md' \
	  'make statistics   rebuild statistics.json' \
	  'make figures      rebuild the four SVG/PNG figures' \
	  'make docker       canonical end-to-end run in Docker' \
	  'make clean        remove generated fixtures and raw results'

setup:
	cd artifact && bash scripts/fetch_upstream.sh
	cd artifact/upstream/bla && npm ci && npm run build
	cd artifact/upstream/rea && npm ci && npm run build:cached

fixtures:
	cd artifact && node scripts/make_fixtures.mjs

baseline:
	cd artifact && node scripts/run_baseline.mjs

matrix:
	cd artifact && node scripts/run_matrix.mjs

variants:
	cd artifact && node scripts/run_variants.mjs

intensity:
	cd artifact && node scripts/intensity_sweep.mjs

equivalence:
	cd artifact && node scripts/verify_equivalence.mjs

models:
	cd artifact && python3 scripts/check_models.py > results/model_equivalence.json

pcap:
	cd artifact && node scripts/pcap_probe.mjs

sqlite:
	cd artifact && node scripts/sqlite_probe.mjs

mcp:
	cd artifact && node scripts/mcp_probe.mjs js-unprotected "$$(pwd)/fixtures/src/app"
	cd artifact && node scripts/mcp_probe.mjs js-protected "$$(pwd)/fixtures/protected/js-app"
	cd artifact && node scripts/mcp_probe.mjs js-unprotected-summary "$$(pwd)/fixtures/src/app" analyze_javascript_application summary
	cd artifact && node scripts/mcp_probe.mjs js-protected-summary "$$(pwd)/fixtures/protected/js-app" analyze_javascript_application summary

replications:
	cd artifact && node scripts/replications.mjs

summary:
	cd artifact && node scripts/summarize.mjs

statistics:
	cd artifact && node scripts/statistics.mjs

figures:
	cd artifact && node scripts/figures.mjs
	cd figures && for f in *.svg; do convert -density 130 "$$f" "$${f%.svg}.png"; done

docker:
	cd artifact && docker compose build study && docker compose run --rm study

clean:
	rm -rf artifact/fixtures/protected artifact/fixtures/intensity artifact/results/raw artifact/results/variants artifact/results/intensity artifact/results/mcp artifact/results/pcap
