"""Candle validation: finite, sorted, sane OHLC and session-aware (hours, holidays, gaps)."""

from __future__ import annotations

import warnings
from dataclasses import dataclass

import numpy as np

from honba.strategy.market import TradingSession
from honba.strategy.mtf import Timeframe
from honba.strategy.series import Bars

__all__ = ["CandleValidationError", "Issue", "validate_candles"]

_IST_MS = 19_800_000
_DAY_MS = 86_400_000


@dataclass(frozen=True, slots=True)
class Issue:
    """One validation finding. ``level`` is ``error`` or ``warning``; ``count`` rows affected."""

    symbol: str
    kind: str
    message: str
    level: str = "error"
    count: int = 1


class CandleValidationError(ValueError):
    """Raised when candles have errors; ``issues`` lists every finding."""

    def __init__(self, issues: list[Issue]) -> None:
        self.issues = issues
        lines = [f"  {i.symbol}: [{i.kind}] {i.message}" for i in issues if i.level == "error"]
        super().__init__("invalid candles:\n" + "\n".join(lines))


def validate_candles(
    candles: dict[str, Bars],
    *,
    session: TradingSession | None = None,
    timeframe: str | None = None,
) -> list[Issue]:
    """Check candles and return every finding (nothing is raised).

    Errors: empty series, NaN / inf, prices <= 0, ``low <= open, close <= high`` broken,
    negative volume, timestamps unsorted or duplicated, and (with ``session``) bars on holidays
    / weekends and intraday bars outside ``[open, close)``. Warnings: missing intraday bars
    inside a session (overnight and holiday gaps are expected and never reported).
    """
    issues: list[Issue] = []
    tf = Timeframe.parse(timeframe) if timeframe else None
    for sym, bars in candles.items():
        n = len(bars)
        if n == 0:
            issues.append(Issue(sym, "empty", "no candles"))
            continue
        cols = np.stack([bars.open, bars.high, bars.low, bars.close, bars.volume])
        bad = ~np.isfinite(cols).all(axis=0)
        if bad.any():
            issues.append(Issue(sym, "nan", "NaN / inf in OHLCV", count=int(bad.sum())))
        t = bars.time_ms
        d = np.diff(t)
        if (d < 0).any():
            issues.append(
                Issue(sym, "unsorted", "timestamps not ascending", count=int((d < 0).sum()))
            )
        if (d == 0).any():
            issues.append(
                Issue(sym, "duplicate", "duplicate timestamps", count=int((d == 0).sum()))
            )
        with np.errstate(invalid="ignore"):
            o, h, lo, c = bars.open, bars.high, bars.low, bars.close
            broken = (lo > np.minimum(o, c)) | (h < np.maximum(o, c)) | (lo > h)
            broken &= ~bad
            if broken.any():
                issues.append(
                    Issue(
                        sym, "ohlc", "low <= open/close <= high violated", count=int(broken.sum())
                    )
                )
            nonpos = (np.minimum.reduce([o, h, lo, c]) <= 0) & ~bad
            if nonpos.any():
                issues.append(
                    Issue(sym, "price", "prices must be positive", count=int(nonpos.sum()))
                )
            if (bars.volume < 0).any():
                issues.append(
                    Issue(sym, "volume", "negative volume", count=int((bars.volume < 0).sum()))
                )
        if session is not None:
            issues.extend(_session_issues(sym, t, session, tf))
    return issues


def _session_issues(
    sym: str, t: np.ndarray, session: TradingSession, tf: Timeframe | None
) -> list[Issue]:
    out: list[Issue] = []
    local = t + _IST_MS
    day = local // _DAY_MS
    minute = (local % _DAY_MS) // 60_000
    intraday = tf.is_intraday if tf else (len(t) > 1 and float(np.median(np.diff(t))) < _DAY_MS)
    weekday = (day + 3) % 7  # 0 = Monday
    holiday_days = {(h.toordinal() - 719163) for h in session.holidays}
    closed = np.isin(day, list(holiday_days)) if holiday_days else np.zeros(len(t), bool)
    if not session.trade_weekends:
        closed |= weekday >= 5
    if closed.any():
        out.append(Issue(sym, "holiday", "bars on holidays / weekends", count=int(closed.sum())))
    if intraday:
        outside = (minute < session.open_minute) | (minute >= session.close_minute)
        outside &= ~closed
        if outside.any():
            out.append(
                Issue(
                    sym,
                    "outside_session",
                    f"bars outside {session.open}-{session.close} IST",
                    count=int(outside.sum()),
                )
            )
        if tf is not None and len(t) > 1:
            step = tf.minutes * 60_000
            same_day = day[1:] == day[:-1]
            gaps = same_day & (np.diff(t) > step * 1.5)
            if gaps.any():
                out.append(
                    Issue(
                        sym,
                        "gap",
                        f"{int(gaps.sum())} missing intraday bar(s)",
                        "warning",
                        int(gaps.sum()),
                    )
                )
    return out


def raise_or_warn(issues: list[Issue], mode: str) -> None:
    """Apply the ``BacktestConfig.validation`` policy to findings."""
    if mode == "off":
        return
    errors = [i for i in issues if i.level == "error"]
    if errors and mode == "error":
        raise CandleValidationError(issues)
    for issue in issues:
        warnings.warn(f"{issue.symbol}: [{issue.kind}] {issue.message}", stacklevel=3)
