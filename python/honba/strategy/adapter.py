"""Runs Strategy subclasses on top of the engine's per-bar callback."""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any

import numpy as np

from .base import Position, Strategy

PENDING_TIMEOUT_BARS = 3


class StrategyAdapter:
    """Bridges the engine ``on_bar`` callback and Jesse-style strategies.

    One strategy instance per symbol. Candle history is kept here, in Python.
    Entries are suppressed while a previously emitted order is still unfilled
    (engine fills happen on a later bar), for at most ``PENDING_TIMEOUT_BARS``.
    """

    def __init__(
        self,
        strategy_cls: type[Strategy],
        symbols: Iterable[str],
        *,
        initial_capital: float = 100_000.0,
        params: dict[str, Any] | None = None,
    ):
        """Instantiate the strategy for each symbol and call ``init``."""
        self.symbols = list(symbols)
        self.strategies = {s: strategy_cls(s, initial_capital, params=params) for s in self.symbols}
        self._rows: dict[str, list[list[float]]] = {s: [] for s in self.symbols}
        self._pending: dict[str, tuple[float, int]] = {}  # symbol -> (position at emit, age)
        for strat in self.strategies.values():
            strat.init()

    def on_bar(self, bar: dict[str, Any]) -> list[dict[str, Any]]:
        """Engine callback: advance every strategy one bar and return actions."""
        actions: list[dict[str, Any]] = []
        positions = bar.get("positions") or {}
        cash = float(bar.get("cash", 0.0))
        for sym, c in (bar.get("candles") or {}).items():
            strat = self.strategies.get(sym)
            if strat is None:
                continue
            self._rows[sym].append(
                [bar["time_ms"], c["open"], c["close"], c["high"], c["low"], c["volume"]]
            )
            actions += self._step(strat, bar["time_ms"], float(positions.get(sym, 0.0)), cash)
        return actions

    def _step(self, strat: Strategy, time_ms: int, qty: float, cash: float) -> list[dict[str, Any]]:
        sym = strat.symbol
        strat.candles = np.asarray(self._rows[sym], dtype=float)
        strat.time_ms = time_ms
        strat.cash = cash
        strat.position_qty = qty
        price = strat.close
        prev = strat.position
        entry = prev.entry_price if prev.qty and qty * prev.qty > 0 else 0.0
        if qty and not entry:
            entry = price
        strat.position = Position(qty=qty, entry_price=entry, current_price=price)

        pending = self._pending.get(sym)
        if pending is not None:
            at_emit, age = pending
            if qty != at_emit or age >= PENDING_TIMEOUT_BARS:
                del self._pending[sym]
            else:
                self._pending[sym] = (at_emit, age + 1)

        strat.before()
        if sym in self._pending:
            pass  # an order is still in flight; do not stack more
        elif strat.position.is_open:
            strat.update_position()
        else:
            if strat.should_long():
                strat.go_long()
            elif strat.should_short():
                strat.go_short()
        strat.after()

        orders = strat._drain_orders()
        if orders and sym not in self._pending:
            self._pending[sym] = (qty, 0)
        return orders
