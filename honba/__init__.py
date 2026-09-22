"""honba — systemic market research platform for Indian securities.

Package layout
--------------
Five packages, flat and boring. The East Asian names are retained as
*product* vocabulary (see ``docs/research/component-naming.md``) but are
deliberately NOT used as import paths — ``honba.data`` costs no mental
lookup, ``honba.kage`` does.

    honba/
    ├── data/          ingestion, cleaning, storage, instrument registry
    │                  (was: soba, nagare, renko, kage, tsuchi)
    ├── research/      analytics, validation, signals, regimes, ML
    │                  (was: bunseki, kehai, chikou, kijun, chuei,
    │                        hikkake, yosoku)
    ├── strategies/    strategy definitions, triggers, risk, execution
    │                  (was: sakata, tenkan, kumo, dojima)
    ├── api/           FastAPI server, SSE push, templates, monitoring
    │                  (was: kaze, shibui, kanshi)
    └── cli/           command-line entry points

Architectural rule (enforced in CI by import-linter)
----------------------------------------------------
``nautilus_trader`` may be imported from exactly three places:

    honba/research/_nautilus_adapter.py   build a run, return DataFrames
    honba/data/_catalog_export.py         own-schema Parquet -> catalog
    honba/strategies/*.py                 actual Strategy subclasses

Everything else speaks pandas/polars DataFrames. NautilusTrader v2 is a
release-candidate line landing 20-40 breaking changes per fortnightly rc
with no GA date; this rule holds the cost of each bump at minutes in one
file instead of days across the codebase.

See ``docs/research/build-vs-extend.md`` §9.
"""

__version__ = "0.1.0"
