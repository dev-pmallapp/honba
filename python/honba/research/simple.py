"""OpenAlgo-style function API: a callback gets a context with ``placeorder`` etc."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any


class BarContext:
    """Per-bar context handed to a simple callback ``fn(ctx)``.

    Mirrors the OpenAlgo call names (``placeorder``, ``placesmartorder``, ``positions``)
    so notebook code ports over. All orders are market orders.
    """

    def __init__(self, bar: dict[str, Any], history: dict[str, list[dict[str, float]]]):
        """Wrap one engine bar plus per-symbol candle history."""
        self.time_ms: int = bar["time_ms"]
        self.candles: dict[str, dict[str, float]] = bar.get("candles") or {}
        self.cash: float = float(bar.get("cash", 0.0))
        self.history = history
        self._positions: dict[str, float] = dict(bar.get("positions") or {})
        self.orders: list[dict[str, Any]] = []

    def positions(self) -> dict[str, float]:
        """Current signed quantity per symbol."""
        return dict(self._positions)

    def position(self, symbol: str) -> float:
        """Current signed quantity for ``symbol``."""
        return self._positions.get(symbol, 0.0)

    def closes(self, symbol: str) -> list[float]:
        """Close history for ``symbol`` up to and including this bar."""
        return [c["close"] for c in self.history.get(symbol, [])]

    def placeorder(
        self, symbol: str, action: str, quantity: float, **_ignored: Any
    ) -> dict[str, Any]:
        """Queue a BUY/SELL market order (extra OpenAlgo kwargs are ignored)."""
        side = action.lower()
        if side not in ("buy", "sell"):
            raise ValueError(f"action must be BUY or SELL, got {action!r}")
        order = {"symbol": symbol, "side": side, "qty": float(quantity)}
        if quantity > 0:
            self.orders.append(order)
        return order

    def placesmartorder(
        self, symbol: str, action: str, quantity: float, position_size: float, **_ignored: Any
    ) -> dict[str, Any] | None:
        """Trade so the position becomes ``position_size`` (OpenAlgo smart-order semantics)."""
        delta = position_size - self.position(symbol)
        if delta == 0:
            return None
        return self.placeorder(symbol, "BUY" if delta > 0 else "SELL", abs(delta))

    def close(self, symbol: str) -> dict[str, Any] | None:
        """Flatten ``symbol``."""
        return self.placesmartorder(symbol, "SELL", 0, 0.0)


class SimpleAdapter:
    """Engine ``on_bar`` for a plain callback."""

    def __init__(self, fn: Callable[[BarContext], Any]):
        """Store the callback."""
        self.fn = fn
        self.history: dict[str, list[dict[str, float]]] = {}

    def on_bar(self, bar: dict[str, Any]) -> list[dict[str, Any]]:
        """Append history, run the callback, return its queued orders."""
        for sym, c in (bar.get("candles") or {}).items():
            self.history.setdefault(sym, []).append(c)
        ctx = BarContext(bar, self.history)
        self.fn(ctx)
        return ctx.orders
