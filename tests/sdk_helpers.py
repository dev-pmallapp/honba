"""Shared builders and strategies for the SDK tests (importable, so process pools can pickle)."""

from __future__ import annotations

from collections.abc import Sequence

import numpy as np
import pandas as pd

import honba as hb


def daily(
    rows: Sequence[tuple[float, float, float, float]], start: str = "2024-01-01"
) -> pd.DataFrame:
    """Daily OHLC rows ``(open, high, low, close)`` on consecutive weekdays (time at 00:00 IST)."""
    idx = pd.bdate_range(start, periods=len(rows))
    o, h, lo, c = zip(*rows, strict=True)
    return pd.DataFrame(
        {"time": idx, "open": o, "high": h, "low": lo, "close": c, "volume": 1000.0}
    )


def flat(price: float, n: int) -> list[tuple[float, float, float, float]]:
    """``n`` flat daily bars at ``price``."""
    return [(price, price, price, price)] * n


def intraday(
    days: int = 2, minutes: int = 5, start: str = "2024-01-01", seed: int = 0
) -> pd.DataFrame:
    """Session-aligned NSE intraday bars (09:15-15:30 IST) on consecutive weekdays."""
    rng = np.random.default_rng(seed)
    per_day = (15 * 60 + 30 - (9 * 60 + 15)) // minutes
    times = []
    for day in pd.bdate_range(start, periods=days):
        times += [day + pd.Timedelta(hours=9, minutes=15 + i * minutes) for i in range(per_day)]
    close = 100 + np.cumsum(rng.normal(0, 0.2, len(times)))
    open_ = np.concatenate(([100.0], close[:-1]))
    high = np.maximum(open_, close) + rng.uniform(0.05, 0.3, len(times))
    low = np.minimum(open_, close) - rng.uniform(0.05, 0.3, len(times))
    return pd.DataFrame(
        {"time": times, "open": open_, "high": high, "low": low, "close": close, "volume": 100.0}
    )


def trending(n: int = 120, seed: int = 1, drift: float = 0.1) -> pd.DataFrame:
    """A noisy daily uptrend / downtrend for parameter sweeps."""
    rng = np.random.default_rng(seed)
    close = 100 + np.cumsum(rng.normal(drift, 1.0, n))
    rows = [(c, c + 0.5, c - 0.5, c) for c in close]
    return daily(rows)


class SmaCross(hb.Strategy):
    """Module-level so ``sweep(jobs=2)`` can pickle it."""

    timeframe = "1d"
    fast = hb.Param(5, low=2, high=20)
    slow = hb.Param(20, low=10, high=60)

    def on_bar(self, ctx):
        """Golden cross in, death cross out."""
        close = self.history().close
        if len(close) < self.slow + 1:
            return
        fast = hb.ta.sma(close, self.fast, sequential=True)
        slow = hb.ta.sma(close, self.slow, sequential=True)
        if self.position.is_flat and hb.ta.crossed_above(fast, slow):
            self.buy(10)
        elif self.position.is_long and hb.ta.crossed_below(fast, slow):
            self.close()
