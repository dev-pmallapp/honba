"""``StrategyRunner``: drives a :class:`Strategy` from engine-neutral bar contexts.

The runner is the only piece an engine needs: call it with each :class:`BarContext` and execute
the returned actions. It keeps the bar history, resamples higher timeframes (closed bars only),
dispatches events to the strategy hooks, tracks round trips and enforces the engine's declared
capabilities.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import Any

from .actions import Action, required_features
from .base import Strategy
from .capabilities import EngineCapabilities
from .market import Instrument, TradingSession
from .mtf import Resampler, Timeframe
from .roundtrip import RoundTripTracker
from .series import BarBuffer, Bars
from .types import BarContext, Cancel, Fill, Reject, RoundTrip

__all__ = ["StrategyRunner"]


class StrategyRunner:
    """Callable ``runner(ctx) -> list[Action]`` around one strategy instance.

    Args:
        strategy: a :class:`Strategy` subclass (instantiated with ``params``) .
        symbols: symbols of the run.
        params: parameter overrides (validated against the declared :class:`Param` bounds).
        instruments: per-symbol exchange rules (lot / tick / freeze).
        session: trading session used to anchor higher-timeframe bars.
        timeframe: overrides the strategy's base ``timeframe`` (data frequency).
        capabilities: engine capabilities; orders using anything else raise
            :class:`UnsupportedFeature`.
        liquidate_at_ms: flatten every position on this bar (end-of-test flatten).

    """

    def __init__(
        self,
        strategy: type[Strategy],
        symbols: Iterable[str],
        *,
        params: Mapping[str, Any] | None = None,
        instruments: Mapping[str, Instrument] | None = None,
        session: TradingSession | None = None,
        timeframe: str | None = None,
        capabilities: EngineCapabilities | None = None,
        liquidate_at_ms: int | None = None,
    ) -> None:
        self.symbols = tuple(symbols)
        self.strategy = strategy(**dict(params or {}))
        self.round_trips: list[RoundTrip] = []
        self._tracker = RoundTripTracker()
        self._liquidate_at_ms = liquidate_at_ms
        self._started = False
        base = Timeframe.parse(timeframe or strategy.timeframe)
        self._base = base
        self._extra = tuple(Timeframe.parse(t) for t in strategy.extra_timeframes)
        session = session or TradingSession()
        self._buffers: dict[tuple[str, str], BarBuffer] = {}
        self._resamplers: dict[tuple[str, str], Resampler] = {}
        for sym in self.symbols:
            self._buffers[(sym, str(base))] = BarBuffer()
            for tf in self._extra:
                if tf == base:
                    continue
                self._buffers[(sym, str(tf))] = BarBuffer()
                self._resamplers[(sym, str(tf))] = Resampler(tf, base, session)
        s = self.strategy
        s.symbols = self.symbols
        s._instruments = dict(instruments or {})
        s._caps = capabilities
        s._history = self._history
        if capabilities is not None and s.requires:
            capabilities.check(s.requires, f"{strategy.__name__}.requires")

    @property
    def logs(self) -> list[tuple[int, str]]:
        """Lines recorded with ``Strategy.log`` as ``(time_ms, message)``."""
        return self.strategy._logs

    # -- history -----------------------------------------------------------------------------

    def _history(self, symbol: str, tf: str | None) -> Bars:
        label = str(self._base if tf is None else Timeframe.parse(tf))
        try:
            return self._buffers[(symbol, label)].view()
        except KeyError:
            if symbol not in self.symbols:
                raise ValueError(f"unknown symbol {symbol!r}") from None
            raise ValueError(
                f"timeframe {label!r} not available: declare it in extra_timeframes "
                f"(base {self._base}, extra {[str(t) for t in self._extra]})"
            ) from None

    def _ingest(self, ctx: BarContext) -> None:
        for symbol, bar in ctx.bars.items():
            base_buf = self._buffers.get((symbol, str(self._base)))
            if base_buf is None:  # symbol the strategy was not told about
                self.symbols += (symbol,)
                self.strategy.symbols = self.symbols
                base_buf = self._buffers[(symbol, str(self._base))] = BarBuffer()
            if bar.time_ms != ctx.time_ms:
                continue  # no new bar for this symbol at this timestamp
            base_buf.append(bar)
            for tf in self._extra:
                resampler = self._resamplers.get((symbol, str(tf)))
                if resampler is not None:
                    for done in resampler.push(bar):
                        self._buffers[(symbol, str(tf))].append(done)

    # -- per bar -----------------------------------------------------------------------------

    def __call__(self, ctx: BarContext) -> list[Action]:
        """Process one bar; returns the actions to execute."""
        s = self.strategy
        self._ingest(ctx)
        s._ctx = ctx
        s._positions.clear()
        s._positions.update(ctx.positions)
        s._queue = []
        s._queued_net = {}
        if not self._started:
            self._started = True
            s.on_start()
        for event in ctx.events:
            self._dispatch(event)
        s.on_bar(ctx)
        if self._liquidate_at_ms is not None and ctx.time_ms >= self._liquidate_at_ms:
            s.close_all(tag="liquidate_end")
        return s._queue

    def _dispatch(self, event: Any) -> None:
        s = self.strategy
        if isinstance(event, Fill):
            s._terminal[event.order_id] = "filled"
            s.on_fill(event)
            for trip in self._tracker.push(event):
                self.round_trips.append(trip)
                s.on_exit(trip)
        elif isinstance(event, Cancel):
            s._terminal[event.id] = "cancelled" if event.kind == "cancel" else "expired"
            s.on_cancel(event)
        elif isinstance(event, Reject):
            if event.id:
                s._terminal[event.id] = "rejected"
            s.on_reject(event)

    def validate(self, actions: Iterable[Action]) -> None:
        """Check ``actions`` against the capabilities (used by engines that bypass ``__call__``)."""
        caps = self.strategy._caps
        if caps is not None:
            for action in actions:
                caps.check(required_features(action))
