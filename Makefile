# Developer entry points. The tracked top-level ``honba/`` (legacy scaffold) shadows
# ``python/honba`` when tools run from the repo root, so tools that import the package run from
# ``python/``.
.PHONY: build test lint lint-imports wire wire-check

build:  ## compile the barter engine into python/honba/_core*.so
	maturin develop --release --skip-install

test:
	pytest

lint:
	ruff check python strategies tests/sdk_helpers.py tests/test_sdk_*.py tests/test_engine_boundary.py
	ruff format --check python strategies tests

lint-imports:  ## import-linter contracts (must run from python/, config lives in pyproject.toml)
	cd python && lint-imports --config ../pyproject.toml

wire:  ## regenerate Rust/Python/TS bindings from schema/honba.wire.schema.json
	python3 tools/wiregen.py

wire-check:  ## fail if generated wire bindings are stale, then run the cross-language fixture tests
	python3 tools/wiregen.py --check
	cargo test -p honba-core --test wire_roundtrip
	pytest tests/test_wire.py
