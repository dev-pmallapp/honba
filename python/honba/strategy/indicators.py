"""Small numpy indicator helpers for strategies (Jesse-style, latest value by default)."""

from __future__ import annotations

import numpy as np

__all__ = ["atr", "crossed_above", "crossed_below", "ema", "rsi", "sma", "stddev"]


def sma(source: np.ndarray, period: int = 20, sequential: bool = False) -> np.ndarray | float:
    """Simple moving average; NaN until ``period`` values are available."""
    src = np.asarray(source, dtype=float)
    out = np.full(src.shape, np.nan)
    if len(src) >= period > 0:
        csum = np.cumsum(np.insert(src, 0, 0.0))
        out[period - 1 :] = (csum[period:] - csum[:-period]) / period
    return out if sequential else (float(out[-1]) if len(out) else float("nan"))


def ema(source: np.ndarray, period: int = 20, sequential: bool = False) -> np.ndarray | float:
    """Exponential moving average seeded with the first value."""
    src = np.asarray(source, dtype=float)
    out = np.full(src.shape, np.nan)
    if len(src):
        alpha = 2.0 / (period + 1)
        out[0] = src[0]
        for i in range(1, len(src)):
            out[i] = alpha * src[i] + (1 - alpha) * out[i - 1]
    return out if sequential else (float(out[-1]) if len(out) else float("nan"))


def stddev(source: np.ndarray, period: int = 20, sequential: bool = False) -> np.ndarray | float:
    """Rolling population standard deviation."""
    src = np.asarray(source, dtype=float)
    out = np.full(src.shape, np.nan)
    for i in range(period - 1, len(src)):
        out[i] = src[i - period + 1 : i + 1].std()
    return out if sequential else (float(out[-1]) if len(out) else float("nan"))


def rsi(source: np.ndarray, period: int = 14, sequential: bool = False) -> np.ndarray | float:
    """Wilder RSI."""
    src = np.asarray(source, dtype=float)
    out = np.full(src.shape, np.nan)
    if len(src) > period:
        delta = np.diff(src)
        gain, loss = np.maximum(delta, 0), np.maximum(-delta, 0)
        avg_g, avg_l = gain[:period].mean(), loss[:period].mean()
        for i in range(period, len(src)):
            if i > period:
                avg_g = (avg_g * (period - 1) + gain[i - 1]) / period
                avg_l = (avg_l * (period - 1) + loss[i - 1]) / period
            out[i] = 100.0 if avg_l == 0 else 100.0 - 100.0 / (1.0 + avg_g / avg_l)
    return out if sequential else (float(out[-1]) if len(out) else float("nan"))


def atr(
    high: np.ndarray, low: np.ndarray, close: np.ndarray, period: int = 14, sequential: bool = False
) -> np.ndarray | float:
    """Average true range (Wilder smoothing)."""
    h, lo, c = (np.asarray(x, dtype=float) for x in (high, low, close))
    out = np.full(c.shape, np.nan)
    if len(c) >= period > 0:
        prev = np.concatenate(([c[0]], c[:-1]))
        tr = np.maximum(h - lo, np.maximum(abs(h - prev), abs(lo - prev)))
        cur = tr[:period].mean()
        out[period - 1] = cur
        for i in range(period, len(c)):
            cur = (cur * (period - 1) + tr[i]) / period
            out[i] = cur
    return out if sequential else (float(out[-1]) if len(out) else float("nan"))


def crossed_above(fast: np.ndarray, slow: np.ndarray) -> bool:
    """True if ``fast`` crossed above ``slow`` on the last bar (arrays of >= 2 values)."""
    return bool(fast[-2] <= slow[-2] and fast[-1] > slow[-1])


def crossed_below(fast: np.ndarray, slow: np.ndarray) -> bool:
    """True if ``fast`` crossed below ``slow`` on the last bar."""
    return bool(fast[-2] >= slow[-2] and fast[-1] < slow[-1])
