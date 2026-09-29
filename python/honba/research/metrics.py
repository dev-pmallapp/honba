"""Jesse-style performance metrics from round trips and the equity curve.

Trade statistics come from round trips (flat -> position -> flat, net of costs) rebuilt from
fills; risk ratios come from daily equity returns annualised over 250 NSE sessions.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass, fields
from datetime import timedelta
from typing import Any

import numpy as np
import pandas as pd

from honba.strategy.types import RoundTrip

__all__ = ["TRADING_DAYS", "Metrics", "compute_metrics", "daily_returns", "drawdown_series"]

TRADING_DAYS = 250
_IST_MS = 19_800_000


def _f(x: float | None) -> float | None:
    return None if x is None or not math.isfinite(x) else float(x)


@dataclass(frozen=True, slots=True)
class Metrics:
    """Performance summary. Undefined values (no trades, zero variance, ...) are ``None``."""

    # capital
    net_profit: float
    net_profit_pct: float
    total_costs: float
    # trades (round trips, net of costs)
    total_trades: int
    winning_trades: int
    losing_trades: int
    win_rate: float | None
    avg_win: float | None
    avg_loss: float | None
    ratio_avg_win_loss: float | None
    expectancy: float | None
    expectancy_pct: float | None
    profit_factor: float | None
    largest_win: float | None
    largest_loss: float | None
    max_win_streak: int
    max_loss_streak: int
    avg_holding: timedelta | None
    avg_win_holding: timedelta | None
    avg_loss_holding: timedelta | None
    longs: int
    shorts: int
    long_win_rate: float | None
    short_win_rate: float | None
    long_pnl: float
    short_pnl: float
    trades_per_day: float | None
    # equity curve
    cagr: float | None
    annual_volatility: float | None
    max_drawdown: float
    longest_underwater_days: float
    ulcer_index: float | None
    sharpe: float | None
    sortino: float | None
    calmar: float | None
    omega: float | None
    serenity: float | None
    best_day: float | None
    worst_day: float | None

    def as_dict(self) -> dict[str, Any]:
        """Plain dict of all metrics."""
        return {f.name: getattr(self, f.name) for f in fields(self)}


def daily_returns(equity: pd.Series, initial_capital: float) -> pd.Series:
    """Compute simple daily returns from a time-indexed equity series.

    Uses the last value per IST session; the first day is measured against ``initial_capital``.
    """
    if equity.empty:
        return pd.Series(dtype=float)
    day = pd.DatetimeIndex(equity.index).tz_convert("UTC") + pd.Timedelta(milliseconds=_IST_MS)
    daily = equity.groupby(day.normalize()).last()
    prev = daily.shift(1)
    prev.iloc[0] = initial_capital
    return daily / prev - 1.0


def drawdown_series(equity: pd.Series, initial_capital: float | None = None) -> pd.Series:
    """Drawdown as a fraction of the running peak (<= 0)."""
    values = (
        equity
        if initial_capital is None
        else pd.concat([pd.Series([initial_capital]), equity.reset_index(drop=True)])
    )
    peak = values.cummax()
    dd = values / peak - 1.0
    return dd if initial_capital is None else dd.iloc[1:].set_axis(equity.index)


def _streak(flags: Sequence[bool]) -> int:
    best = cur = 0
    for f in flags:
        cur = cur + 1 if f else 0
        best = max(best, cur)
    return best


def _underwater_days(equity: pd.Series, initial_capital: float) -> float:
    if equity.empty:
        return 0.0
    peak = max(initial_capital, float("-inf"))
    peak_t = equity.index[0]
    longest = timedelta(0)
    for t, e in equity.items():
        if e >= peak:
            longest = max(longest, t - peak_t)
            peak, peak_t = e, t
    longest = max(longest, equity.index[-1] - peak_t)
    return longest.total_seconds() / 86_400.0


def _mean_td(trips: Sequence[RoundTrip]) -> timedelta | None:
    return sum((t.holding for t in trips), timedelta()) / len(trips) if trips else None


def compute_metrics(
    trips: Sequence[RoundTrip],
    equity: pd.Series,
    initial_capital: float,
    risk_free_return: float = 0.0,
    trading_days: int = TRADING_DAYS,
) -> Metrics:
    """Compute :class:`Metrics`.

    ``equity`` is indexed by tz-aware time; ``risk_free_return`` is an annual fraction and
    ``trading_days`` the annualisation factor (sessions per year).
    """
    pnl = np.array([t.pnl for t in trips])
    wins = [t for t in trips if t.pnl > 0]
    losses = [t for t in trips if t.pnl <= 0]
    gross_win = sum(t.pnl for t in wins)
    gross_loss = -sum(t.pnl for t in trips if t.pnl < 0)
    longs = [t for t in trips if t.side == "long"]
    shorts = [t for t in trips if t.side == "short"]

    def rate(group: list[RoundTrip]) -> float | None:
        return sum(t.pnl > 0 for t in group) / len(group) if group else None

    avg_win = gross_win / len(wins) if wins else None
    avg_loss = (sum(t.pnl for t in losses) / len(losses)) if losses else None
    days = 0.0
    if trips:
        days = max((trips[-1].exit_time_ms - trips[0].entry_time_ms) / 86_400_000, 1.0)

    final = float(equity.iloc[-1]) if len(equity) else initial_capital
    rets = daily_returns(equity, initial_capital)
    rf_d = risk_free_return / trading_days
    cagr = vol = sharpe = sortino = omega = serenity = ulcer = None
    if len(equity) >= 2:
        span = (equity.index[-1] - equity.index[0]).total_seconds() / (365.25 * 86_400)
        if span > 0 and final > 0:
            cagr = (final / initial_capital) ** (1 / span) - 1
    dd = drawdown_series(equity, initial_capital) if len(equity) else pd.Series(dtype=float)
    max_dd = float(-dd.min()) if len(dd) else 0.0
    if len(rets) >= 2:
        ex = rets - rf_d
        sd = float(rets.std(ddof=1))
        if sd > 0:
            vol = sd * math.sqrt(trading_days)
            sharpe = float(ex.mean()) / sd * math.sqrt(trading_days)
        down = float(np.sqrt(np.mean(np.minimum(ex.to_numpy(), 0.0) ** 2)))
        if down > 0:
            sortino = float(ex.mean()) / down * math.sqrt(trading_days)
        neg = float(-ex[ex < 0].sum())
        omega = float(ex[ex > 0].sum()) / neg if neg > 0 else None
        # Jesse serenity index: (sum of returns - rf) / (ulcer index * pitfall)
        daily_dd = drawdown_series((1 + rets).cumprod())
        ulcer = float(np.sqrt((daily_dd**2).sum() / (len(rets) - 1)))
        tail = np.sort(daily_dd.to_numpy())
        cvar = float(tail[: max(int(0.05 * len(tail)), 1)].mean())
        if sd > 0 and ulcer > 0 and cvar < 0:
            serenity = (float(rets.sum()) - risk_free_return) / (ulcer * (-cvar / sd))
    calmar = cagr / max_dd if cagr is not None and max_dd > 0 else None

    return Metrics(
        net_profit=final - initial_capital,
        net_profit_pct=(final - initial_capital) / initial_capital,
        total_costs=float(sum(t.costs for t in trips)),
        total_trades=len(trips),
        winning_trades=len(wins),
        losing_trades=len(losses),
        win_rate=len(wins) / len(trips) if trips else None,
        avg_win=avg_win,
        avg_loss=avg_loss,
        ratio_avg_win_loss=avg_win / -avg_loss if avg_win and avg_loss else None,
        expectancy=float(pnl.mean()) if len(pnl) else None,
        expectancy_pct=float(np.mean([t.return_pct for t in trips])) if trips else None,
        profit_factor=gross_win / gross_loss if gross_loss > 0 else None,
        largest_win=max((t.pnl for t in wins), default=None),
        largest_loss=min((t.pnl for t in losses), default=None),
        max_win_streak=_streak([t.pnl > 0 for t in trips]),
        max_loss_streak=_streak([t.pnl <= 0 for t in trips]),
        avg_holding=_mean_td(trips),
        avg_win_holding=_mean_td(wins),
        avg_loss_holding=_mean_td(losses),
        longs=len(longs),
        shorts=len(shorts),
        long_win_rate=rate(longs),
        short_win_rate=rate(shorts),
        long_pnl=float(sum(t.pnl for t in longs)),
        short_pnl=float(sum(t.pnl for t in shorts)),
        trades_per_day=len(trips) / days if days else None,
        cagr=_f(cagr),
        annual_volatility=_f(vol),
        max_drawdown=max_dd,
        longest_underwater_days=_underwater_days(equity, initial_capital),
        ulcer_index=_f(ulcer),
        sharpe=_f(sharpe),
        sortino=_f(sortino),
        calmar=_f(calmar),
        omega=_f(omega),
        serenity=_f(serenity),
        best_day=_f(float(rets.max())) if len(rets) else None,
        worst_day=_f(float(rets.min())) if len(rets) else None,
    )
