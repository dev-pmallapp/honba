"""Research layer — analytics, validation, signal discovery, regimes, ML.

Consolidates the former ``bunseki``, ``kehai``, ``chikou``, ``kijun``,
``chuei``, ``hikkake`` and ``yosoku`` packages:

    Bunseki (分析)    analytics — performance metrics, factor research,
                     Monte Carlo, walk-forward
    Kehai  (気配)    signal discovery — anomaly scans, unusual volume,
                     option activity, FII/DII flow divergence
    Chikou (遅行)    validation — look-ahead / survivorship / data-snooping
                     detection, out-of-sample stability
    Kijun  (基準)    benchmarks — NIFTY 50 TR, sector indices, risk-free curve
    Chuei   (추세)    regime detection — HMM classifier, trend strength
    Hikkake (引っ掛け) anomaly & trap detection, data quality monitoring
    Yosoku (予測)    ML — now ``honba.research.ml``

Boundary rule
-------------
**Nothing in this package may import ``nautilus_trader``** except
``_nautilus_adapter.py``, and nothing may import ``honba.data``,
``honba.api`` or ``honba.strategies``. Both are enforced in CI by
import-linter (see ``[tool.importlinter]`` in ``pyproject.toml``).

Everything here takes *bars in, trade list out* as DataFrames:
significance testing, trade-shuffle Monte Carlo, feature importance and
the Optuna harness need no event-driven engine at all. Keeping them
engine-free is what makes them survive the v2 release-candidate churn —
and what would let them survive dropping Nautilus entirely.

See ``docs/research/build-vs-extend.md`` §9.
"""
