"""The rc-churn firewall: the ONLY file in ``honba.research`` that may
import ``nautilus_trader``.

Why this file exists
--------------------
NautilusTrader v2 is a release-candidate line. rc5 shipped 2026-09-15 on
a ~13-day cadence; each rc has landed 20-40 breaking changes (rc3 removed
Cython wholesale; rc4 renamed configs and changed backtest leverage
defaults; rc5 deleted ``ForwardPrice`` and
``PortfolioStatistic.calculate_from_orders``; rc6 reworks the catalog
API). There is no stated GA date, and ``develop_v1`` receives critical
security backports only for ~3 months after the v2 cutover — so there is
no v1 refuge either.

The cost of each bump is set by how much Nautilus surface the codebase
touches. Concentrating it here holds that cost at *minutes in one file*
instead of *days across the codebase*.

Contract
--------
In:   bars + instrument definitions + strategy config (DataFrames / plain
      Python objects)
Out:  ``orders``, ``fills``, ``positions``, ``account`` DataFrames, plus a
      returns series

Nothing Nautilus-typed crosses this boundary. No ``Bar``, no ``Instrument``,
no ``Position``, no ``Portfolio`` — callers in ``honba.research`` must never
need to know Nautilus exists.

Implementation notes for week 3 (see docs/research/build-vs-extend.md §10)
--------------------------------------------------------------------------
* Pin exactly: ``nautilus-trader==2.0.0rc5``. Never float a range against
  an rc series.
* Report generators moved onto ``BacktestNode`` and now take the run-config
  ID as first argument.
* ``engine.reset()`` retains data, instruments, venues and registered
  components — so Optuna trial loops are cheap. It does NOT reset strategy
  indicator buffers; a leaked buffer is a silent look-ahead leak *between
  trials*.
* Seed the fill/slippage RNG per trial. Assert identical PnL across two
  runs of identical params before trusting a single optimization result,
  otherwise Optuna optimizes noise and nobody finds out.
* Prefer computing metrics from the returned DataFrames over
  ``Portfolio.register_statistic()`` — that API was absent in early rcs and
  re-added in rc5, and ``calculate_from_orders`` was removed outright.
* Save one run as a *golden backtest* and re-run it after every rc bump.
  It is the only regression test that matters here.
"""

__all__: list[str] = []
