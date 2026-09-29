"""``PortfolioStrategy``: one instance, a universe of symbols, target-weight rebalancing.

::

    class Momentum(PortfolioStrategy):
        universe = ("RELIANCE", "TCS", "INFY", "HDFCBANK", "ICICIBANK")
        rebalance_every = "month"
        top = Param(2, low=1, high=5)

        def on_rebalance(self, ctx):
            scores = {s: self.history(s).close[-1] / self.history(s).close[-60] for s in
                      self.tradable() if len(self.history(s)) > 60}
            best = sorted(scores, key=scores.get, reverse=True)[: self.top]
            self.rebalance({s: 0.95 / len(best) for s in best})

Every symbol shares the same instance, so cross-sectional state (``self.state``, ranks,
pair spreads) needs no globals. ``rebalance`` turns target weights into smart ``target``
orders: exits and reductions first (they free cash at the same close), then entries.
"""

from __future__ import annotations

import math
from collections.abc import Mapping
from datetime import date
from typing import Any

from .base import OrderHandle, Strategy
from .types import BarContext

__all__ = ["PortfolioStrategy"]

_IST_MS = 19_800_000
_DAY_MS = 86_400_000
_EPS = 1e-9


class PortfolioStrategy(Strategy):
    """Multi-symbol strategy with a universe and a rebalance schedule.

    Class attributes: ``universe`` (symbols to trade; empty = every symbol of the run; may be
    overridden by a property for a dynamic, point-in-time universe) and ``rebalance_every``
    (``"bar"``, ``"day"``, ``"week"``, ``"month"`` or an int number of bars; ``None`` = never
    call :meth:`on_rebalance`, drive :meth:`rebalance` from ``on_bar`` yourself).
    Implement :meth:`on_rebalance`; overriding ``on_bar`` is optional (call
    ``super().on_bar(ctx)`` to keep the schedule).
    """

    universe: tuple[str, ...] = ()
    rebalance_every: str | int | None = "bar"

    def __init__(self, **params: Any) -> None:
        super().__init__(**params)
        self.state: dict[str, Any] = {}
        self._last_key: Any = None
        self._bars_since = 0

    # -- schedule ----------------------------------------------------------------------------

    def on_rebalance(self, ctx: BarContext) -> None:
        """Called on every scheduled rebalance bar (never during warm-up)."""
        raise NotImplementedError(f"{type(self).__name__} must implement on_rebalance(ctx)")

    def on_bar(self, ctx: BarContext) -> None:
        """Call :meth:`on_rebalance` when the schedule says so."""
        if ctx.warmup or self.rebalance_every is None:
            return
        if self._due(ctx.time_ms):
            self.on_rebalance(ctx)

    def _due(self, time_ms: int) -> bool:
        every = self.rebalance_every
        if isinstance(every, int) and not isinstance(every, bool):
            if every < 1:
                raise ValueError("rebalance_every must be >= 1 bars")
            due = self._last_key is None or self._bars_since + 1 >= every
            self._bars_since = 0 if due else self._bars_since + 1
            if due:
                self._last_key = time_ms
            return due
        day = (time_ms + _IST_MS) // _DAY_MS
        if every == "bar":
            key: Any = time_ms
        elif every == "day":
            key = day
        elif every == "week":
            key = (day + 3) // 7  # epoch day 0 is a Thursday: weeks start on Monday
        elif every == "month":
            d = date.fromordinal(int(day) + 719_163)
            key = (d.year, d.month)
        else:
            raise ValueError(
                f"rebalance_every must be 'bar', 'day', 'week', 'month', an int or None, "
                f"got {every!r}"
            )
        if key == self._last_key:
            return False
        self._last_key = key
        return True

    # -- universe and weights ----------------------------------------------------------------

    def members(self) -> tuple[str, ...]:
        """The universe restricted to the run's symbols (every symbol when none is declared)."""
        declared = tuple(self.universe)
        if not declared:
            return tuple(self.symbols)
        return tuple(s for s in declared if s in self.symbols)

    def tradable(self) -> tuple[str, ...]:
        """Universe members with a fresh bar at the current timestamp."""
        ctx = self.ctx
        return tuple(
            s
            for s in self.members()
            if (b := ctx.bars.get(s)) is not None and b.time_ms == ctx.time_ms
        )

    def weights(self) -> dict[str, float]:
        """Current signed weight (position value / equity) of every open position."""
        eq = self.equity
        if eq <= 0:
            return {}
        out = {}
        for sym, pos in self.positions.items():
            if pos.is_open and sym in self.ctx.bars:
                out[sym] = pos.qty * self.last_price(sym) / eq
        return out

    def rebalance(
        self,
        weights: Mapping[str, float],
        *,
        tolerance: float = 0.0,
        close_others: bool = True,
        max_gross: float | None = 1.0,
        group: str | None = "rebalance",
        **kwargs: Any,
    ) -> list[OrderHandle]:
        """Trade to target weights (fractions of equity at the latest close).

        ``weights`` maps symbols to signed weights (negative = short, needs ``allow_short``).
        Positions in symbols not listed are closed when ``close_others``. A symbol whose weight
        is within ``tolerance`` of its target is left alone (fewer small trades); closing to
        zero always goes through. ``max_gross`` caps ``sum(|w|)`` (``None`` = no cap, e.g.
        with MIS leverage). Orders use :meth:`target` (lot-rounded, resting entries cancelled,
        no double counting) and are sent reductions first. ``group`` tags the orders for the
        report; other keyword arguments go to :meth:`target` (``product``, ``tag``, ...).
        """
        targets: dict[str, float] = {}
        for sym, w in weights.items():
            w = float(w)
            if not math.isfinite(w):
                raise ValueError(f"weight of {sym!r} must be finite, got {w!r}")
            if sym not in self.symbols:
                raise ValueError(f"{sym!r} is not a symbol of this run {list(self.symbols)}")
            targets[sym] = w
        gross = sum(abs(w) for w in targets.values())
        if max_gross is not None and gross > max_gross + _EPS:
            raise ValueError(f"gross weight {gross:.4f} exceeds max_gross={max_gross}")
        current = self.weights()
        if close_others:
            for sym in current:
                targets.setdefault(sym, 0.0)
        plan = []
        for sym, w in targets.items():
            now = current.get(sym, 0.0)
            closing = w == 0.0 and self.positions[sym].is_open
            if not closing and abs(w - now) < tolerance:
                continue
            reduces = abs(w) < abs(now) or w * now < 0
            plan.append((0 if reduces else 1, sym, w))
        handles = []
        for _, sym, w in sorted(plan, key=lambda p: p[0]):
            if sym not in self.ctx.bars:
                self.log(f"rebalance skipped {sym}: no bar yet")
                continue
            h = self.target(sym, pct=w, group=group, **kwargs)
            if h is not None:
                handles.append(h)
        return handles
