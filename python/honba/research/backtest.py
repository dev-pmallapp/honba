"""Public research entry points: ``backtest`` and ``sweep``."""

from __future__ import annotations

import inspect
import itertools
from collections.abc import Callable, Iterable, Mapping
from typing import Any

import pandas as pd

from honba.strategy import Strategy, StrategyAdapter

from ._data import to_candles
from .result import BacktestResult
from .simple import SimpleAdapter


def backtest(
    strategy: type[Strategy] | Callable[..., Any],
    data: Any,
    symbols: list[str] | str | None = None,
    *,
    initial_capital: float = 100_000.0,
    fees_percent: float = 0.0,
    latency_ms: int = 0,
    risk_free_return: float = 0.0,
    exchange: str = "NSE",
    quote: str = "INR",
    params: dict[str, Any] | None = None,
) -> BacktestResult:
    """Backtest a strategy on the barter engine.

    ``strategy`` is a :class:`Strategy` subclass (Jesse-style, one instance per symbol) or a
    plain callback ``fn(ctx: BarContext)`` (OpenAlgo-style). ``data`` is a ``{symbol: frame}``
    dict, a long-format frame with a ``symbol`` column, or a single frame plus ``symbols``.
    Frames may be pandas or polars with time/open/high/low/close/volume columns.
    """
    from . import _barter_adapter  # deferred: keeps the engine out of ``import honba.research``

    candles = to_candles(data, symbols)
    names = list(candles)
    config = {
        "symbols": names,
        "exchange": exchange,
        "quote": quote,
        "initial_cash": float(initial_capital),
        "fees_percent": float(fees_percent),
        "latency_ms": int(latency_ms),
        "risk_free_return": float(risk_free_return),
    }
    if inspect.isclass(strategy) and issubclass(strategy, Strategy):
        on_bar = StrategyAdapter(
            strategy, names, initial_capital=initial_capital, params=params
        ).on_bar
    elif callable(strategy):
        on_bar = SimpleAdapter(strategy).on_bar
    else:
        raise TypeError("strategy must be a Strategy subclass or a callable")
    raw = _barter_adapter.run_backtest(config, candles, on_bar)
    return BacktestResult(raw=raw, config=config, params=dict(params or {}))


def sweep(
    strategy: type[Strategy],
    data: Any,
    grid: Mapping[str, Iterable[Any]],
    symbols: list[str] | str | None = None,
    *,
    sort_by: str | None = None,
    ascending: bool = False,
    **kwargs: Any,
) -> pd.DataFrame:
    """Run ``backtest`` for every combination in ``grid`` (sequentially).

    Returns one row per combination: the parameters followed by the summary metrics.
    The full results are kept in ``df.attrs["results"]``. Extra kwargs go to ``backtest``.
    """
    keys = list(grid)
    rows: list[dict[str, Any]] = []
    results: list[BacktestResult] = []
    base = kwargs.pop("params", None) or {}
    for combo in itertools.product(*(list(grid[k]) for k in keys)):
        p = {**base, **dict(zip(keys, combo, strict=True))}
        res = backtest(strategy, data, symbols, params=p, **kwargs)
        results.append(res)
        rows.append({**{k: p[k] for k in keys}, **res.summary})
    frame = pd.DataFrame(rows)
    if sort_by and sort_by in frame.columns:
        order = frame[sort_by].sort_values(ascending=ascending).index
        frame = frame.loc[order].reset_index(drop=True)
        results = [results[i] for i in order]
    frame.attrs["results"] = results
    return frame
