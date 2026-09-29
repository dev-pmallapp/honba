"""Vectorised numpy indicators for strategies.

Every function takes numpy arrays (``Bars`` columns work directly) and returns the latest value,
or the whole series when ``sequential=True`` (NaN until enough data). Smoothing recursions use
pandas' C ``ewm``; windows use ``sliding_window_view`` / cumulative sums, so there are no
Python loops over bars.
"""

from __future__ import annotations

from typing import NamedTuple

import numpy as np
import pandas as pd
from numpy.lib.stride_tricks import sliding_window_view

__all__ = [
    "Bollinger",
    "Macd",
    "atr",
    "bollinger",
    "crossed",
    "crossed_above",
    "crossed_below",
    "ema",
    "highest",
    "lowest",
    "macd",
    "roc",
    "rsi",
    "sma",
    "stddev",
    "true_range",
    "vwap",
    "wilder",
]


def _arr(x: object) -> np.ndarray:
    return np.asarray(x, dtype=float)


def _out(series: np.ndarray, sequential: bool) -> np.ndarray | float:
    if sequential:
        return series
    return float(series[-1]) if len(series) else float("nan")


def _rolling(src: np.ndarray, period: int, fn: str) -> np.ndarray:
    out = np.full(src.shape, np.nan)
    if 0 < period <= len(src):
        window = sliding_window_view(src, period)
        out[period - 1 :] = getattr(window, fn)(axis=1)
    return out


def sma(source: np.ndarray, period: int = 20, sequential: bool = False) -> np.ndarray | float:
    """Simple moving average."""
    src = _arr(source)
    out = np.full(src.shape, np.nan)
    if len(src) >= period > 0:
        csum = np.cumsum(np.insert(src, 0, 0.0))
        out[period - 1 :] = (csum[period:] - csum[:-period]) / period
    return _out(out, sequential)


def ema(source: np.ndarray, period: int = 20, sequential: bool = False) -> np.ndarray | float:
    """Exponential moving average seeded with the first value (``alpha = 2 / (period + 1)``)."""
    src = _arr(source)
    out = pd.Series(src).ewm(alpha=2.0 / (period + 1), adjust=False).mean().to_numpy()
    return _out(out, sequential)


def wilder(source: np.ndarray, period: int = 14, sequential: bool = False) -> np.ndarray | float:
    """Wilder's smoothing (RMA): SMA seed over the first ``period`` values, then ``1/period``."""
    src = _arr(source).copy()
    out = np.full(src.shape, np.nan)
    if len(src) >= period > 0:
        src[period - 1] = src[:period].mean()
        src[: period - 1] = np.nan
        out = pd.Series(src).ewm(alpha=1.0 / period, adjust=False).mean().to_numpy()
    return _out(out, sequential)


def stddev(source: np.ndarray, period: int = 20, sequential: bool = False) -> np.ndarray | float:
    """Rolling population standard deviation."""
    return _out(_rolling(_arr(source), period, "std"), sequential)


def highest(source: np.ndarray, period: int = 20, sequential: bool = False) -> np.ndarray | float:
    """Rolling maximum (includes the current bar)."""
    return _out(_rolling(_arr(source), period, "max"), sequential)


def lowest(source: np.ndarray, period: int = 20, sequential: bool = False) -> np.ndarray | float:
    """Rolling minimum (includes the current bar)."""
    return _out(_rolling(_arr(source), period, "min"), sequential)


def roc(source: np.ndarray, period: int = 10, sequential: bool = False) -> np.ndarray | float:
    """Rate of change over ``period`` bars, as a fraction."""
    src = _arr(source)
    out = np.full(src.shape, np.nan)
    if len(src) > period > 0:
        out[period:] = src[period:] / src[:-period] - 1.0
    return _out(out, sequential)


def rsi(source: np.ndarray, period: int = 14, sequential: bool = False) -> np.ndarray | float:
    """Wilder RSI (0-100)."""
    src = _arr(source)
    out = np.full(src.shape, np.nan)
    if len(src) > period > 0:
        delta = np.concatenate(([np.nan], np.diff(src)))
        gain, loss = np.where(delta > 0, delta, 0.0), np.where(delta < 0, -delta, 0.0)
        gain[0] = loss[0] = np.nan
        avg_g = wilder(gain[1:], period, sequential=True)
        avg_l = wilder(loss[1:], period, sequential=True)
        with np.errstate(divide="ignore", invalid="ignore"):
            rs = avg_g / avg_l
            vals = np.where(avg_l == 0, 100.0, 100.0 - 100.0 / (1.0 + rs))
        vals[np.isnan(avg_g)] = np.nan
        out[1:] = vals
    return _out(out, sequential)


def true_range(
    high: np.ndarray, low: np.ndarray, close: np.ndarray, sequential: bool = True
) -> np.ndarray | float:
    """True range (the first bar uses ``high - low``)."""
    h, lo, c = _arr(high), _arr(low), _arr(close)
    prev = np.concatenate((c[:1], c[:-1]))
    tr = np.maximum(h - lo, np.maximum(np.abs(h - prev), np.abs(lo - prev)))
    return _out(tr, sequential)


def atr(
    high: np.ndarray,
    low: np.ndarray,
    close: np.ndarray,
    period: int = 14,
    sequential: bool = False,
) -> np.ndarray | float:
    """Average true range (Wilder smoothing)."""
    tr = true_range(high, low, close, sequential=True)
    return wilder(tr, period, sequential)  # type: ignore[arg-type]


class Macd(NamedTuple):
    """MACD line, signal line and histogram."""

    macd: np.ndarray | float
    signal: np.ndarray | float
    hist: np.ndarray | float


def macd(
    source: np.ndarray,
    fast: int = 12,
    slow: int = 26,
    signal: int = 9,
    sequential: bool = False,
) -> Macd:
    """Moving average convergence/divergence."""
    line = ema(source, fast, True) - ema(source, slow, True)  # type: ignore[operator]
    sig = ema(line, signal, True)
    hist = line - sig  # type: ignore[operator]
    return Macd(_out(line, sequential), _out(sig, sequential), _out(hist, sequential))  # type: ignore[arg-type]


class Bollinger(NamedTuple):
    """Bollinger bands."""

    upper: np.ndarray | float
    middle: np.ndarray | float
    lower: np.ndarray | float


def bollinger(
    source: np.ndarray, period: int = 20, mult: float = 2.0, sequential: bool = False
) -> Bollinger:
    """Bollinger bands: SMA +/- ``mult`` population standard deviations."""
    mid = sma(source, period, True)
    dev = stddev(source, period, True) * mult  # type: ignore[operator]
    return Bollinger(
        _out(mid + dev, sequential),  # type: ignore[operator]
        _out(mid, sequential),  # type: ignore[arg-type]
        _out(mid - dev, sequential),  # type: ignore[operator]
    )


def vwap(
    high: np.ndarray,
    low: np.ndarray,
    close: np.ndarray,
    volume: np.ndarray,
    sessions: np.ndarray | None = None,
    sequential: bool = False,
) -> np.ndarray | float:
    """Volume-weighted average price on the typical price.

    Restarts whenever ``sessions`` changes (pass ``Bars.sessions`` for a session-anchored VWAP).
    """
    typical = (_arr(high) + _arr(low) + _arr(close)) / 3.0
    vol = _arr(volume)
    pv, v = typical * vol, vol
    if sessions is None:
        cum_pv, cum_v = np.cumsum(pv), np.cumsum(v)
    else:
        group = pd.Series(np.asarray(sessions))
        cum_pv = pd.Series(pv).groupby(group).cumsum().to_numpy()
        cum_v = pd.Series(v).groupby(group).cumsum().to_numpy()
    with np.errstate(divide="ignore", invalid="ignore"):
        out = np.where(cum_v > 0, cum_pv / cum_v, np.nan)
    return _out(out, sequential)


def crossed_above(fast: np.ndarray, slow: np.ndarray | float) -> bool:
    """True if ``fast`` crossed above ``slow`` on the last bar (``slow`` may be a level)."""
    return crossed(fast, slow, "above")


def crossed_below(fast: np.ndarray, slow: np.ndarray | float) -> bool:
    """True if ``fast`` crossed below ``slow`` on the last bar (``slow`` may be a level)."""
    return crossed(fast, slow, "below")


def crossed(fast: np.ndarray, slow: np.ndarray | float, direction: str = "above") -> bool:
    """Cross test on the last two values; False while either series is still NaN."""
    f = _arr(fast)
    s = _arr(slow) if np.ndim(slow) else np.full(f.shape, float(slow))  # type: ignore[arg-type]
    if len(f) < 2 or len(s) < 2 or np.isnan([f[-2], f[-1], s[-2], s[-1]]).any():
        return False
    if direction == "above":
        return bool(f[-2] <= s[-2] and f[-1] > s[-1])
    return bool(f[-2] >= s[-2] and f[-1] < s[-1])
