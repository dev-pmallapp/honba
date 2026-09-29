"""Round-trip trades (flat -> position -> flat) reconstructed from fills."""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, field

from .types import Fill, RoundTrip

__all__ = ["RoundTripTracker", "round_trips_from_fills"]

_EPS = 1e-9


@dataclass(slots=True)
class _Open:
    side: str
    entry_time_ms: int
    entry_tag: str | None
    product: str | None
    entry_qty: float = 0.0
    entry_value: float = 0.0
    exit_qty: float = 0.0
    exit_value: float = 0.0
    gross: float = 0.0
    costs: float = 0.0
    fills: int = 0


@dataclass(slots=True)
class RoundTripTracker:
    """Feed fills in execution order with :meth:`push`; closed trips are returned.

    A fill that flips a position closes the old trip and opens a new one with the remainder;
    its costs are split pro rata by quantity.
    """

    _qty: dict[str, float] = field(default_factory=dict)
    _open: dict[str, _Open] = field(default_factory=dict)

    def push(self, fill: Fill) -> list[RoundTrip]:
        """Apply one fill; returns the round trip it completed (if any)."""
        out: list[RoundTrip] = []
        symbol = fill.symbol
        remaining = fill.signed_qty
        while abs(remaining) > _EPS:
            qty = self._qty.get(symbol, 0.0)
            share = abs(remaining) / fill.qty if fill.qty else 1.0
            costs = fill.costs.total * share
            if abs(qty) <= _EPS:
                trip = _Open(
                    "long" if remaining > 0 else "short", fill.time_ms, fill.tag, fill.product
                )
                self._open[symbol] = trip
                trip.entry_qty += abs(remaining)
                trip.entry_value += abs(remaining) * fill.price
                trip.costs += costs
                trip.fills += 1
                self._qty[symbol] = remaining
                break
            trip = self._open[symbol]
            if qty * remaining > 0:  # adding to the position
                trip.entry_qty += abs(remaining)
                trip.entry_value += abs(remaining) * fill.price
                trip.costs += costs
                trip.fills += 1
                self._qty[symbol] = qty + remaining
                break
            closing = min(abs(remaining), abs(qty))
            frac = closing / fill.qty if fill.qty else 1.0
            trip.exit_qty += closing
            trip.exit_value += closing * fill.price
            trip.gross += fill.realised_pnl  # all realised PnL of a fill belongs to what it closed
            trip.costs += fill.costs.total * frac
            trip.fills += 1
            sign = 1.0 if remaining > 0 else -1.0
            self._qty[symbol] = qty + sign * closing
            remaining -= sign * closing
            if abs(self._qty[symbol]) <= _EPS:
                self._qty[symbol] = 0.0
                out.append(self._close(symbol, fill))
        return out

    def _close(self, symbol: str, fill: Fill) -> RoundTrip:
        t = self._open.pop(symbol)
        return RoundTrip(
            symbol=symbol,
            side=t.side,  # type: ignore[arg-type]
            qty=t.entry_qty,
            entry_time_ms=t.entry_time_ms,
            exit_time_ms=fill.time_ms,
            entry_price=t.entry_value / t.entry_qty,
            exit_price=t.exit_value / t.exit_qty,
            gross_pnl=t.gross,
            costs=t.costs,
            entry_tag=t.entry_tag,
            exit_tag=fill.tag,
            exit_reason=fill.reason,
            product=t.product,
            fills=t.fills,
        )

    def open_qty(self, symbol: str) -> float:
        """Net quantity currently tracked for ``symbol``."""
        return self._qty.get(symbol, 0.0)


def round_trips_from_fills(fills: Iterable[Fill]) -> list[RoundTrip]:
    """All completed round trips in a fill list (positions still open at the end are ignored)."""
    tracker = RoundTripTracker()
    trips: list[RoundTrip] = []
    for fill in fills:
        trips.extend(tracker.push(fill))
    return trips
