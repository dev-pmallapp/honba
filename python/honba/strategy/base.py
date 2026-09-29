"""Jesse-style Strategy base class.

Lifecycle, evaluated once per bar by :class:`honba.strategy.adapter.StrategyAdapter`::

    init()                       once, before the first bar
    before()                     every bar, first
    if position is open:  update_position()
    elif should_long():   go_long()
    elif should_short():  go_short()
    after()                      every bar, last

Orders are expressed by assigning ``self.buy`` / ``self.sell`` (a quantity, or
``(qty, price)`` for Jesse compatibility - the price is ignored, orders are market
orders filled by the engine) or by calling :meth:`liquidate`.
"""
# ruff: noqa: B027  (optional lifecycle hooks are intentionally empty)

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any

import numpy as np

# Column layout of ``Strategy.candles`` (same as Jesse).
TS, OPEN, CLOSE, HIGH, LOW, VOLUME = range(6)


@dataclass
class Position:
    """Current position of the strategy's symbol."""

    qty: float = 0.0
    entry_price: float = 0.0
    current_price: float = 0.0

    @property
    def is_long(self) -> bool:
        """True when qty > 0."""
        return self.qty > 0

    @property
    def is_short(self) -> bool:
        """True when qty < 0."""
        return self.qty < 0

    @property
    def is_open(self) -> bool:
        """True when a position is held."""
        return self.qty != 0

    @property
    def pnl(self) -> float:
        """Unrealised PnL versus the tracked entry price."""
        return (self.current_price - self.entry_price) * self.qty if self.is_open else 0.0


class Strategy(ABC):
    """Base Strategy class inspired by Jesse's lifecycle model."""

    timeframe: str = "5m"
    params: dict[str, Any] = {}  # noqa: RUF012 - class-level defaults, copied per instance

    def __init__(
        self,
        symbol: str,
        initial_capital: float = 100_000.0,
        params: dict[str, Any] | None = None,
    ):
        """Create a strategy bound to one symbol."""
        self.symbol = symbol
        self.initial_capital = initial_capital
        self.cash = initial_capital
        self.position_qty: float = 0
        self.params = {**type(self).params, **(params or {})}
        self.candles: np.ndarray = np.empty((0, 6))
        self.position = Position()
        self.time_ms: int = 0
        self._orders: list[dict[str, Any]] = []

    # ------------------------------------------------------------------ lifecycle
    def init(self):
        """Lifecycle hook called before simulation commences."""

    def before(self):
        """Hook called at the start of every bar."""

    def after(self):
        """Hook called at the end of every bar."""

    @abstractmethod
    def should_long(self) -> bool:
        """Evaluates entry condition for going long."""
        return False

    def should_short(self) -> bool:
        """Evaluates entry condition for going short."""
        return False

    @abstractmethod
    def go_long(self):
        """Executes long entry order."""

    def go_short(self):
        """Executes short entry order."""

    def update_position(self):
        """Lifecycle hook evaluated on each bar while a position is open."""

    # ------------------------------------------------------------------ data
    @property
    def index(self) -> int:
        """Index of the current bar (0-based)."""
        return len(self.candles) - 1

    @property
    def current_candle(self) -> np.ndarray:
        """Latest candle ``[ts, open, close, high, low, volume]``."""
        return self.candles[-1]

    @property
    def open(self) -> float:
        """Latest open."""
        return float(self.candles[-1, OPEN])

    @property
    def close(self) -> float:
        """Latest close."""
        return float(self.candles[-1, CLOSE])

    @property
    def high(self) -> float:
        """Latest high."""
        return float(self.candles[-1, HIGH])

    @property
    def low(self) -> float:
        """Latest low."""
        return float(self.candles[-1, LOW])

    @property
    def volume(self) -> float:
        """Latest volume."""
        return float(self.candles[-1, VOLUME])

    price = close

    @property
    def balance(self) -> float:
        """Available cash as reported by the engine."""
        return self.cash

    @property
    def is_long(self) -> bool:
        """Shortcut for ``self.position.is_long``."""
        return self.position.is_long

    @property
    def is_short(self) -> bool:
        """Shortcut for ``self.position.is_short``."""
        return self.position.is_short

    # ------------------------------------------------------------------ orders
    @staticmethod
    def _qty(value: Any) -> float:
        return float(value[0] if isinstance(value, (tuple, list)) else value)

    @property
    def buy(self) -> float:
        """Total quantity queued to buy this bar."""
        return sum(o["qty"] for o in self._orders if o["side"] == "buy")

    @buy.setter
    def buy(self, value: Any) -> None:
        self.order("buy", self._qty(value))

    @property
    def sell(self) -> float:
        """Total quantity queued to sell this bar."""
        return sum(o["qty"] for o in self._orders if o["side"] == "sell")

    @sell.setter
    def sell(self, value: Any) -> None:
        self.order("sell", self._qty(value))

    def order(self, side: str, qty: float) -> None:
        """Queue a market order (``side`` is ``"buy"`` or ``"sell"``)."""
        if side not in ("buy", "sell"):
            raise ValueError(f"side must be 'buy' or 'sell', got {side!r}")
        if qty > 0:
            self._orders.append({"symbol": self.symbol, "side": side, "qty": float(qty)})

    def liquidate(self) -> None:
        """Queue an order that flattens the current position."""
        qty = self.position.qty
        if qty > 0:
            self.order("sell", qty)
        elif qty < 0:
            self.order("buy", -qty)

    def _drain_orders(self) -> list[dict[str, Any]]:
        orders, self._orders = self._orders, []
        return orders
