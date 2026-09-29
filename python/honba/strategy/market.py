"""Market metadata: instruments (lot / tick / freeze) and the exchange session."""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import date, time

__all__ = ["Instrument", "TradingSession"]

_SEGMENTS = ("equity_cash", "equity_futures", "equity_options", "commodity", "currency")


def _parse_hhmm(value: str) -> int:
    h, _, m = value.partition(":")
    return int(h) * 60 + int(m or 0)


@dataclass(frozen=True, slots=True)
class Instrument:
    """Exchange rules of one symbol.

    Unknown symbols behave as equity cash with lot 1 and no tick validation, like the engine.
    """

    segment: str = "equity_cash"
    lot_size: float = 1.0
    tick_size: float | None = None
    freeze_qty: float | None = None
    default_product: str | None = None

    def __post_init__(self) -> None:
        if self.segment not in _SEGMENTS:
            raise ValueError(f"segment must be one of {_SEGMENTS}, got {self.segment!r}")
        if not self.lot_size > 0:
            raise ValueError("lot_size must be positive")
        if self.tick_size is not None and not self.tick_size > 0:
            raise ValueError("tick_size must be positive")

    def round_price(self, price: float, mode: str = "nearest") -> float:
        """Round ``price`` to a tick multiple (``nearest``, ``down`` or ``up``)."""
        if self.tick_size is None:
            return float(price)
        ratio = round(price / self.tick_size, 9)
        rounder = {"nearest": lambda r: math.floor(r + 0.5), "down": math.floor, "up": math.ceil}
        steps = rounder[mode](ratio)
        return round(steps * self.tick_size, 10)

    def round_qty(self, qty: float) -> float:
        """Round the magnitude of ``qty`` down to a whole number of lots (sign kept)."""
        lots = math.floor(round(abs(qty) / self.lot_size, 9))
        return math.copysign(lots * self.lot_size, qty) if lots else 0.0


@dataclass(frozen=True, slots=True)
class TradingSession:
    """Exchange trading hours (IST). Defaults are the NSE cash session."""

    open: str = "09:15"
    close: str = "15:30"
    mis_square_off: str | None = "15:20"
    holidays: frozenset[date] = field(default_factory=frozenset)
    trade_weekends: bool = False

    @property
    def open_minute(self) -> int:
        """Session open as minutes after midnight."""
        return _parse_hhmm(self.open)

    @property
    def close_minute(self) -> int:
        """Session close as minutes after midnight."""
        return _parse_hhmm(self.close)

    def is_trading_day(self, day: date) -> bool:
        """False for holidays and (unless ``trade_weekends``) weekends."""
        if day in self.holidays:
            return False
        return self.trade_weekends or day.weekday() < 5

    def in_hours(self, at: time) -> bool:
        """True when the local time lies in ``[open, close)``."""
        minute = at.hour * 60 + at.minute
        return self.open_minute <= minute < self.close_minute
