"""Public research entry points: ``backtest`` and ``sweep``."""

from __future__ import annotations

import inspect
import multiprocessing
from collections.abc import Callable, Mapping, Sequence
from concurrent.futures import ProcessPoolExecutor
from typing import Any

import numpy as np
import pandas as pd

from honba.strategy.base import Strategy
from honba.strategy.params import grid_of
from honba.strategy.runner import StrategyRunner
from honba.strategy.series import Bars

from ._data import to_candles
from .config import BacktestConfig
from .engine import (
    BacktestEngine,
    BacktestRequest,
    UnsupportedFeature,
    config_features,
    get_engine,
)
from .result import BacktestResult
from .validation import raise_or_warn, validate_candles

__all__ = ["backtest", "sweep"]


def _resolve_start(config: BacktestConfig, candles: dict[str, Bars]) -> int | None:
    start = config.start_ms
    if config.warmup_bars:
        times = np.unique(np.concatenate([b.time_ms for b in candles.values()]))
        if config.warmup_bars >= len(times):
            raise ValueError(
                f"warmup_bars={config.warmup_bars} leaves no bars to trade ({len(times)} total)"
            )
        by_bars = int(times[config.warmup_bars])
        start = by_bars if start is None else max(start, by_bars)
    return start


def _run(
    strategy: type[Strategy],
    candles: dict[str, Bars],
    config: BacktestConfig,
    params: Mapping[str, Any],
    engine: str | BacktestEngine | None,
) -> BacktestResult:
    eng = get_engine(engine)
    caps = eng.capabilities()
    request = BacktestRequest(config, candles, _resolve_start(config, candles))
    caps.check(config_features(request), "config")
    liquidate = None
    if config.liquidate_at_end and not caps.supports("liquidate_at_end"):
        if config.fill == "next_open":
            # a market order placed on the last bar could never fill: refuse instead of lying
            raise UnsupportedFeature(
                eng.name, ["liquidate_at_end"], "fill='next_open' needs engine-side liquidation"
            )
        liquidate = request.last_ms  # SDK fallback: close_all on the last bar (close fills)
    runner = StrategyRunner(
        strategy,
        request.symbols,
        params=params,
        instruments=config.instruments,
        session=config.session,
        timeframe=config.timeframe,
        capabilities=caps,
        liquidate_at_ms=liquidate,
        buy_cost=config.costs.estimate_buy,
    )
    report = eng.run(request, runner)
    return BacktestResult(
        report=report,
        config=config,
        params=runner.strategy.param_values,
        logs=runner.logs,
        strategy=strategy.__name__,
        order_groups=runner.order_groups,
    )


def _prepare(
    strategy: type[Strategy],
    data: Any,
    config: BacktestConfig,
    symbols: Sequence[str] | str | None,
) -> dict[str, Bars]:
    if not (inspect.isclass(strategy) and issubclass(strategy, Strategy)):
        raise TypeError("strategy must be a honba.Strategy subclass")
    candles = to_candles(
        data,
        list(symbols) if isinstance(symbols, (list, tuple)) else symbols,
        sort=config.sort_candles,
    )
    tf = config.timeframe or strategy.timeframe
    issues = validate_candles(
        candles,
        session=config.session,
        timeframe=tf,
        uses_mis=strategy.product == "MIS",
    )
    raise_or_warn(issues, config.validation)
    return candles


def _check_param_names(strategy: type[Strategy], names: Mapping[str, Any]) -> None:
    declared = strategy.params() if inspect.isclass(strategy) else {}
    unknown = set(names) - set(declared)
    if unknown:
        raise ValueError(
            f"undeclared parameters {sorted(unknown)} for {strategy.__name__}; "
            f"declared: {sorted(declared)}"
        )


def backtest(
    strategy: type[Strategy],
    data: Any,
    config: BacktestConfig | None = None,
    *,
    symbols: Sequence[str] | str | None = None,
    params: Mapping[str, Any] | None = None,
    engine: str | BacktestEngine | None = None,
) -> BacktestResult:
    """Backtest ``strategy`` on ``data``.

    ``data`` is a ``{symbol: frame}`` dict, a long frame with a ``symbol`` column, or one frame
    plus ``symbols``; frames (pandas or polars) need open / high / low / close (+ volume) and a
    time column or datetime index (naive times are IST). ``params`` override the strategy's
    declared :class:`Param` defaults. ``engine`` is a registered name or a
    :class:`BacktestEngine` (default ``"barter"``). Raises :class:`UnsupportedFeature` before
    the run when the engine cannot honour the config, and when an order needs a feature it
    lacks. Candles are validated first (``config.validation``).
    """
    config = config or BacktestConfig()
    _check_param_names(strategy, params or {})
    candles = _prepare(strategy, data, config, symbols)
    return _run(strategy, candles, config, dict(params or {}), engine)


def _worker(args: tuple[Any, ...]) -> BacktestResult:
    return _run(*args)


def sweep(
    strategy: type[Strategy],
    data: Any,
    grid: Mapping[str, Sequence[Any]] | None = None,
    config: BacktestConfig | None = None,
    *,
    symbols: Sequence[str] | str | None = None,
    params: Mapping[str, Any] | None = None,
    engine: str | BacktestEngine | None = None,
    constraint: Callable[[dict[str, Any]], bool] | None = None,
    sort_by: str | None = "net_pnl",
    ascending: bool = False,
    jobs: int = 1,
) -> pd.DataFrame:
    """Run ``backtest`` for every combination of a parameter grid.

    ``grid`` maps parameter names to candidate values; omitted, it is built from every declared
    :class:`Param` (its ``choices`` or ``low..high``). Values are validated against the declared
    bounds before anything runs (numpy scalars are accepted; NaN / inf are rejected). ``constraint``
    is a callable on the parameter dict returning False for combinations to skip (e.g.
    ``lambda p: p["fast"] < p["slow"]``); skipped combinations are counted in
    ``df.attrs["n_skipped"]``. Returns one row per run (the parameters, engine summary
    metrics, trade metrics), sorted by ``sort_by`` (missing values last); the results are in
    ``df.attrs["results"]`` (same order) and ``df.attrs["n_trials"]`` holds the trial count
    (feed it to the deflated-Sharpe audit).

    Strategy callbacks are Python, so they hold the GIL: threads (and the Rust ``run_sweep``)
    cannot speed a sweep up. ``jobs > 1`` runs combinations in separate *processes* (spawn), which
    needs a module-level strategy class and a picklable ``engine`` (a name is fine).
    """
    config = config or BacktestConfig()
    declared = strategy.params() if inspect.isclass(strategy) else {}
    if grid is None:
        grid = {name: p.grid() for name, p in declared.items()}
    if not grid:
        raise ValueError("nothing to sweep: pass a grid or declare Params on the strategy")
    unknown = set(grid) - set(declared)
    if unknown:
        raise ValueError(
            f"grid names undeclared parameters {sorted(unknown)}; declared {sorted(declared)}"
        )
    _check_param_names(strategy, params or {})
    combos = [{**dict(params or {}), **c} for c in grid_of(grid)]
    total = len(combos)
    if constraint is not None:
        combos = [c for c in combos if constraint(c)]
        if not combos:
            raise ValueError(f"constraint excluded all {total} parameter combinations")
    for combo in combos:  # fail fast on out-of-bounds values
        for name, value in combo.items():
            declared[name].validate(value)
    candles = _prepare(strategy, data, config, symbols)

    if jobs == 1:
        results = [_run(strategy, candles, config, c, engine) for c in combos]
    else:
        ctx = multiprocessing.get_context("spawn")
        with ProcessPoolExecutor(max_workers=jobs, mp_context=ctx) as pool:
            results = list(
                pool.map(_worker, [(strategy, candles, config, c, engine) for c in combos])
            )

    rows = []
    for combo, res in zip(combos, results, strict=True):
        m = res.metrics
        rows.append(
            {
                **{k: combo[k] for k in grid},
                **res.summary,
                "total_trades": m.total_trades,
                "expectancy": m.expectancy,
                "omega": m.omega,
                "serenity": m.serenity,
            }
        )
    frame = pd.DataFrame(rows).drop(columns=["costs"], errors="ignore")
    if sort_by:
        if sort_by not in frame.columns:
            raise ValueError(f"sort_by {sort_by!r} is not a column: {list(frame.columns)}")
        order = frame[sort_by].sort_values(ascending=ascending, na_position="last").index
        frame = frame.loc[order].reset_index(drop=True)
        results = [results[i] for i in order]
    frame.attrs["results"] = results
    frame.attrs["n_trials"] = len(results)
    frame.attrs["n_skipped"] = total - len(results)
    return frame
