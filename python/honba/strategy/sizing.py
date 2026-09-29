"""Position sizing that respects lot size, tick size and available cash.

The module-level functions are pure; :class:`Sizer` (``self.size`` inside a strategy) binds them
to the run's equity, prices and instrument metadata. Every quantity is rounded *down* to a whole
number of lots, so results can be zero (too little risk budget for one lot): check before
ordering.
"""

from __future__ import annotations

import math
from typing import TYPE_CHECKING

from .market import Instrument

if TYPE_CHECKING:
    from .base import Strategy

__all__ = [
    "Sizer",
    "floor_to_lot",
    "kelly_fraction",
    "qty_by_atr",
    "qty_by_fraction",
    "qty_by_risk",
    "qty_by_value",
    "round_to_tick",
]


def floor_to_lot(qty: float, lot_size: float = 1.0) -> float:
    """Round ``qty`` down to a multiple of ``lot_size`` (never negative)."""
    if not math.isfinite(qty) or qty <= 0:
        return 0.0
    return math.floor(round(qty / lot_size, 9)) * lot_size


def round_to_tick(price: float, tick_size: float | None, mode: str = "nearest") -> float:
    """Round ``price`` to a tick multiple (``nearest``, ``down`` or ``up``)."""
    return Instrument(tick_size=tick_size).round_price(price, mode)


def qty_by_value(value: float, price: float, lot_size: float = 1.0) -> float:
    """Quantity worth about ``value`` at ``price``."""
    if price <= 0:
        raise ValueError("price must be positive")
    return floor_to_lot(value / price, lot_size)


def qty_by_fraction(equity: float, fraction: float, price: float, lot_size: float = 1.0) -> float:
    """Fixed-fraction sizing: quantity worth ``fraction`` of ``equity``."""
    return qty_by_value(equity * fraction, price, lot_size)


def qty_by_risk(
    equity: float,
    risk_pct: float,
    entry: float,
    stop: float,
    lot_size: float = 1.0,
) -> float:
    """Size by risk percent.

    Lose ``risk_pct`` (a fraction, 0.01 = 1%) of ``equity`` if ``stop`` is hit from ``entry``.
    """
    distance = abs(entry - stop)
    if distance <= 0:
        raise ValueError("entry and stop must differ")
    return floor_to_lot(equity * risk_pct / distance, lot_size)


def qty_by_atr(
    equity: float,
    risk_pct: float,
    atr: float,
    mult: float = 2.0,
    lot_size: float = 1.0,
) -> float:
    """ATR sizing: the stop sits ``mult`` x ``atr`` from entry, risking ``risk_pct`` of equity."""
    if not atr > 0 or not mult > 0:
        raise ValueError("atr and mult must be positive")
    return floor_to_lot(equity * risk_pct / (atr * mult), lot_size)


def kelly_fraction(win_rate: float, payoff_ratio: float, scale: float = 1.0) -> float:
    """Kelly bet fraction ``W - (1 - W) / R`` (clipped at 0), times ``scale`` (0.5 = half Kelly)."""
    if not 0 <= win_rate <= 1 or payoff_ratio <= 0:
        raise ValueError("win_rate must be in [0, 1] and payoff_ratio positive")
    return max(win_rate - (1 - win_rate) / payoff_ratio, 0.0) * scale


class Sizer:
    """Sizing bound to a strategy run (``self.size``).

    Defaults: equity from the current bar, price from the symbol's latest close, lot size from
    the instrument metadata. ``max_value`` caps the order's notional; ``cap_cash=True`` caps it
    at available cash (long, unleveraged).
    """

    def __init__(self, strategy: Strategy) -> None:
        self._s = strategy

    def _resolve(self, symbol: str | None) -> tuple[str, Instrument]:
        sym = self._s._symbol(symbol)
        return sym, self._s.instrument(sym)

    def _cap(
        self,
        qty: float,
        price: float,
        inst: Instrument,
        max_value: float | None,
        cap_cash: bool,
    ) -> float:
        limit = max_value
        if cap_cash:
            cash = self._s.cash
            limit = cash if limit is None else min(limit, cash)
        if limit is not None and price > 0:
            qty = min(qty, floor_to_lot(limit / price, inst.lot_size))
        return qty

    def by_value(
        self,
        value: float,
        *,
        symbol: str | None = None,
        price: float | None = None,
        cap_cash: bool = False,
    ) -> float:
        """Quantity worth about ``value``."""
        sym, inst = self._resolve(symbol)
        px = price if price is not None else self._s.last_price(sym)
        return self._cap(qty_by_value(value, px, inst.lot_size), px, inst, None, cap_cash)

    def by_fraction(
        self,
        fraction: float,
        *,
        symbol: str | None = None,
        price: float | None = None,
        equity: float | None = None,
        cap_cash: bool = False,
    ) -> float:
        """Fixed-fraction sizing (``0.1`` = 10% of equity)."""
        eq = self._s.equity if equity is None else equity
        return self.by_value(eq * fraction, symbol=symbol, price=price, cap_cash=cap_cash)

    def by_risk(
        self,
        risk_pct: float,
        *,
        entry: float,
        stop: float,
        symbol: str | None = None,
        equity: float | None = None,
        max_value: float | None = None,
        cap_cash: bool = False,
    ) -> float:
        """Risk-percent sizing (``0.01`` = risk 1% of equity between ``entry`` and ``stop``)."""
        _, inst = self._resolve(symbol)
        eq = self._s.equity if equity is None else equity
        qty = qty_by_risk(eq, risk_pct, entry, stop, inst.lot_size)
        return self._cap(qty, entry, inst, max_value, cap_cash)

    def by_atr(
        self,
        risk_pct: float,
        *,
        atr: float,
        mult: float = 2.0,
        symbol: str | None = None,
        price: float | None = None,
        equity: float | None = None,
        max_value: float | None = None,
        cap_cash: bool = False,
    ) -> float:
        """ATR sizing (stop ``mult`` x ``atr`` from entry)."""
        sym, inst = self._resolve(symbol)
        eq = self._s.equity if equity is None else equity
        px = price if price is not None else self._s.last_price(sym)
        qty = qty_by_atr(eq, risk_pct, atr, mult, inst.lot_size)
        return self._cap(qty, px, inst, max_value, cap_cash)

    @staticmethod
    def kelly(win_rate: float, payoff_ratio: float, scale: float = 0.5) -> float:
        """Kelly fraction (half Kelly by default), see :func:`kelly_fraction`."""
        return kelly_fraction(win_rate, payoff_ratio, scale)
