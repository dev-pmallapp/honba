"""Multi-timeframe resampling anchored to the exchange session.

Higher-timeframe (HTF) bars are built from the base bars in Python. Buckets are anchored at the
session open (09:15 IST for NSE), not at midnight: ``1h`` gives 09:15, 10:15, ... 15:15 (the
last one is a 15-minute stub clipped at the close) and ``1d`` is one exchange session. A bucket
is published only once its last base bar has closed, so a strategy can never see a bar that is
still forming (no look-ahead).

Bar timestamps are open times, as in the engine: a base bar stamped ``t`` covers
``[t, t + base)``.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from .market import TradingSession
from .types import Bar

__all__ = ["Resampler", "Timeframe"]

_MS_MINUTE = 60_000
_MS_DAY = 86_400_000
_IST_MS = 19_800_000


@dataclass(frozen=True, slots=True)
class Timeframe:
    """A bar interval such as ``5m``, ``1h``, ``1d`` or ``1w``."""

    n: int
    unit: str  # "m", "h", "d" or "w"

    @classmethod
    def parse(cls, text: str | Timeframe) -> Timeframe:
        """Parse ``"15m"`` / ``"1H"`` / ``"1D"`` (case-insensitive)."""
        if isinstance(text, Timeframe):
            return text
        match = re.fullmatch(r"\s*(\d+)\s*([mhdw])\s*", str(text).lower())
        if not match or int(match.group(1)) < 1:
            raise ValueError(f"invalid timeframe {text!r} (use e.g. 5m, 1h, 1d, 1w)")
        tf = cls(int(match.group(1)), match.group(2))
        if tf.unit in "dw" and tf.n != 1:
            raise ValueError(f"timeframe {text!r}: only 1d and 1w are supported")
        return tf

    @property
    def minutes(self) -> int:
        """Length in minutes (a session day counts as 1440, a week as 7 days)."""
        return {"m": 1, "h": 60, "d": 1440, "w": 10080}[self.unit] * self.n

    @property
    def is_intraday(self) -> bool:
        """True for minute / hour intervals."""
        return self.unit in "mh"

    def __str__(self) -> str:
        return f"{self.n}{self.unit}"


@dataclass(slots=True)
class _Bucket:
    key: tuple[int, ...]
    start_ms: int
    end_ms: int | None  # last instant (exclusive) of the bucket; None = only a later bar closes it
    open: float
    high: float
    low: float
    close: float
    volume: float

    def bar(self) -> Bar:
        return Bar(self.start_ms, self.open, self.high, self.low, self.close, self.volume)


class Resampler:
    """Aggregate base bars of one symbol into closed higher-timeframe bars."""

    def __init__(
        self,
        target: str | Timeframe,
        base: str | Timeframe,
        session: TradingSession | None = None,
    ) -> None:
        self.target = Timeframe.parse(target)
        self.base = Timeframe.parse(base)
        self.session = session or TradingSession()
        if self.target.minutes < self.base.minutes:
            raise ValueError(f"cannot resample {self.base} bars down to {self.target}")
        if self.target.is_intraday and (
            not self.base.is_intraday or self.target.minutes % self.base.minutes
        ):
            raise ValueError(f"{self.target} is not a multiple of the base timeframe {self.base}")
        self._cur: _Bucket | None = None

    # -- bucketing ---------------------------------------------------------------------------

    def _bucket(self, t_ms: int) -> tuple[tuple[int, ...], int, int | None]:
        local = t_ms + _IST_MS
        day, rem = divmod(local, _MS_DAY)
        day_start = day * _MS_DAY - _IST_MS
        open_min, close_min = self.session.open_minute, self.session.close_minute
        if self.target.is_intraday:
            minute = rem // _MS_MINUTE
            n = self.target.minutes
            k = (minute - open_min) // n
            start_min = open_min + k * n
            end_min = min(start_min + n, close_min) if start_min < close_min else start_min + n
            return (day, k), day_start + start_min * _MS_MINUTE, day_start + end_min * _MS_MINUTE
        if self.target.unit == "d":
            if self.base.is_intraday:
                return (day,), day_start, day_start + close_min * _MS_MINUTE
            return (day,), day_start, None if self.base.minutes > 1440 else t_ms + self.base_ms
        # weekly: closes on the Friday session (or when the next week's first bar arrives)
        weekday = (day + 3) % 7  # 1970-01-01 was a Thursday -> 0 = Monday
        week = (day + 3) // 7
        start = day_start - weekday * _MS_DAY
        end = start + 4 * _MS_DAY + close_min * _MS_MINUTE if self.base.is_intraday else None
        if not self.base.is_intraday and weekday == 4:
            end = t_ms + self.base_ms
        return (week,), start, end

    @property
    def base_ms(self) -> int:
        """Base bar length in milliseconds."""
        return self.base.minutes * _MS_MINUTE

    # -- streaming ---------------------------------------------------------------------------

    def push(self, bar: Bar) -> list[Bar]:
        """Feed the next base bar (already closed); returns the HTF bars that just closed."""
        if self.target.minutes == self.base.minutes:
            return [bar]
        out: list[Bar] = []
        key, start, end = self._bucket(bar.time_ms)
        cur = self._cur
        if cur is not None and cur.key != key:
            out.append(cur.bar())  # ended without seeing its last base bar (data gap)
            cur = None
        if cur is None:
            cur = _Bucket(key, start, end, bar.open, bar.high, bar.low, bar.close, bar.volume)
        else:
            cur.high = max(cur.high, bar.high)
            cur.low = min(cur.low, bar.low)
            cur.close = bar.close
            cur.volume += bar.volume
            cur.end_ms = end
        if cur.end_ms is not None and bar.time_ms + self.base_ms >= cur.end_ms:
            out.append(cur.bar())
            cur = None
        self._cur = cur
        return out
