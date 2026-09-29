"""The ``Strategy`` base class: one ``on_bar`` plus optional event hooks and an order API.

A single instance handles every symbol of the run (one symbol or many)::

    class Breakout(Strategy):
        timeframe = "15m"
        extra_timeframes = ("1d",)
        product = MIS
        lookback = Param(20, low=10, high=60)

        def on_bar(self, ctx):
            bars = self.history()
            if self.position.is_flat and ctx.bar.close > bars.high[-self.lookback - 1 : -1].max():
                self.buy(self.size.by_fraction(0.1), stop_loss=ctx.bar.close * 0.99, tag="breakout")

Order methods queue actions; the runner hands the queue to the engine when ``on_bar`` (or a
hook) returns. Nothing here knows which engine executes the orders.
"""
# ruff: noqa: B027  (optional hooks are intentionally empty)

from __future__ import annotations

import inspect
import math
from abc import ABC, abstractmethod
from collections.abc import Iterator
from contextlib import contextmanager
from typing import TYPE_CHECKING, Any

from .actions import (
    Action,
    CancelAll,
    CancelOrder,
    ExitLevel,
    ModifyOrder,
    PlaceOrder,
    required_features,
)
from .capabilities import EngineCapabilities
from .market import Instrument
from .params import Param
from .series import Bars
from .sizing import Sizer
from .types import (
    Bar,
    BarContext,
    Cancel,
    Fill,
    Leg,
    Order,
    Position,
    Reject,
    RejectReason,
    RoundTrip,
    SessionState,
    StopUpdate,
    Trail,
    TrailUpdate,
)

if TYPE_CHECKING:
    from collections.abc import Callable, Mapping, Sequence
    from datetime import datetime

__all__ = ["OrderHandle", "Strategy"]

_LOT_EPS = 1e-9


class _Positions(dict[str, Position]):
    """Position map that returns a flat ``Position`` for symbols without one."""

    def __missing__(self, key: str) -> Position:
        return Position()


class OrderHandle:
    """Reference to a submitted order (returned by ``buy`` / ``sell`` / ``target``).

    The order reaches the engine when the current bar's callbacks return, so ``status`` reads
    ``"submitted"`` until the next bar. Attached exits are ``stop_order`` / ``target_order``.
    """

    __slots__ = ("_strategy", "id", "symbol")

    def __init__(self, strategy: Strategy, order_id: str, symbol: str) -> None:
        self._strategy = strategy
        self.id = order_id
        self.symbol = symbol

    @property
    def status(self) -> str:
        """submitted, open, pending, partially_filled, filled, cancelled, expired or rejected."""
        return self._strategy._status_of(self.id)

    @property
    def order(self) -> Order | None:
        """Latest engine view while the order is open / pending, else ``None``."""
        return self._strategy._open_order(self.id)

    @property
    def stop_order(self) -> OrderHandle:
        """Handle of the attached stop loss (``<id>:sl``)."""
        return OrderHandle(self._strategy, f"{self.id}:sl", self.symbol)

    @property
    def target_order(self) -> OrderHandle:
        """Handle of the attached take profit (``<id>:tp``)."""
        return OrderHandle(self._strategy, f"{self.id}:tp", self.symbol)

    def stop_leg(self, n: int) -> OrderHandle:
        """Handle of stop-loss leg ``n`` (1-based) of an entry placed with ``stop_loss`` legs."""
        return OrderHandle(self._strategy, f"{self.id}:sl{n}", self.symbol)

    def target_leg(self, n: int) -> OrderHandle:
        """Handle of take-profit leg ``n`` (1-based) of an entry placed with target legs."""
        return OrderHandle(self._strategy, f"{self.id}:tp{n}", self.symbol)

    def modify(self, **changes: Any) -> None:
        """``Strategy.modify`` on this order."""
        self._strategy.modify(self, **changes)

    def cancel(self) -> None:
        """Cancel this order."""
        self._strategy.cancel(self)

    def __repr__(self) -> str:
        return f"OrderHandle({self.id!r}, {self.symbol!r}, status={self.status!r})"


class Strategy(ABC):
    """Base class of every strategy. Implement :meth:`on_bar`; the other hooks are optional.

    Class attributes: ``timeframe`` (bar interval of the data fed by the engine),
    ``extra_timeframes`` (resampled in Python, session-anchored, closed bars only), ``product``
    (default product of orders) and ``requires`` (engine features the strategy needs, checked
    before the run; features used but not listed are still checked when first used). Tunable
    values are declared as :class:`Param` class attributes.
    """

    timeframe: str = "1d"
    extra_timeframes: tuple[str, ...] = ()
    product: str | None = None
    requires: tuple[str, ...] = ()

    _params: dict[str, Param] = {}  # noqa: RUF012 - filled per subclass in __init_subclass__

    def __init_subclass__(cls, **kwargs: Any) -> None:
        super().__init_subclass__(**kwargs)
        merged: dict[str, Param] = {}
        for base in reversed(cls.__mro__[1:]):
            merged.update(getattr(base, "_params", {}))
        for name, value in vars(cls).items():
            if isinstance(value, Param):
                merged[name] = value
        cls._params = merged

    def __init__(self, **params: Any) -> None:
        unknown = set(params) - set(self._params)
        if unknown:
            raise TypeError(
                f"{type(self).__name__}: unknown parameters {sorted(unknown)}; "
                f"declared: {sorted(self._params)}"
            )
        self._param_values = {
            name: p.validate(params.get(name, p.default)) for name, p in self._params.items()
        }
        # runtime state, attached by the runner
        self.symbols: tuple[str, ...] = ()
        self.size = Sizer(self)
        self._instruments: dict[str, Instrument] = {}
        self._caps: EngineCapabilities | None = None
        self._buy_cost: Callable[[float], float] | None = None
        self._ctx: BarContext | None = None
        self._positions: _Positions = _Positions()
        self._queue: list[Action] = []
        self._queued_net: dict[str, float] = {}
        self._order_symbols: dict[str, str] = {}
        self._terminal: dict[str, str] = {}
        self._history: Any = None
        self._logs: list[tuple[int, str]] = []
        self._pending_rejects: list[Reject] = []
        self._seq = 0
        self._groups: dict[str, str] = {}
        self._group: str | None = None

    # -- declared parameters -----------------------------------------------------------------

    @classmethod
    def params(cls) -> dict[str, Param]:
        """The declared parameters (name -> :class:`Param`)."""
        return dict(cls._params)

    @property
    def param_values(self) -> dict[str, Any]:
        """Parameter values of this run."""
        return dict(self._param_values)

    # -- hooks -------------------------------------------------------------------------------

    def on_start(self) -> None:
        """Called once, before the first bar (``self.symbols`` and params are available)."""

    @abstractmethod
    def on_bar(self, ctx: BarContext) -> None:
        """Called once per bar timestamp, after this bar's events were delivered."""

    def on_fill(self, fill: Fill) -> None:
        """One of this strategy's orders (or an attached exit) was executed.

        Called once per fill event, including attached exits. With volume-capped slippage an
        order fills in pieces: ``on_fill`` runs for every piece, ``fill.is_partial`` is True
        while ``fill.remaining_qty`` is still working (``handle.status`` reads
        ``partially_filled``) and the order's last piece has ``remaining_qty == 0``. The
        remainder may later be cancelled or expire (``on_cancel``). ``on_exit`` fires only when
        the position goes flat, never for a partial fill that leaves quantity open.
        """

    def on_exit(self, trade: RoundTrip) -> None:
        """A position went flat; ``trade`` is the completed round trip."""

    def on_reject(self, reject: Reject) -> None:
        """The engine rejected an order or operation (``reject.reason`` says why)."""

    def on_cancel(self, cancel: Cancel) -> None:
        """An order was cancelled or expired (``cancel.kind`` tells which)."""

    def on_stop_update(self, update: TrailUpdate | StopUpdate) -> None:
        """The engine moved a stop.

        A trailing-stop ratchet (:class:`TrailUpdate`) or the move to entry after the first
        target filled (:class:`StopUpdate`).
        """

    def filters(self) -> Sequence[Callable[..., bool]]:
        """Entry filters: callables that must all return True for a new entry to be sent.

        Override to return e.g. ``[self.trend_up, self.not_expiry_day]``. A filter takes no
        arguments or ``(symbol, side)``. Only orders that open or add to a position are gated;
        exits and reductions always pass, and a reversal is trimmed to a plain exit. Blocked
        entries return ``None`` and leave a log line naming the filter.
        """
        return ()

    # -- state -------------------------------------------------------------------------------

    @property
    def ctx(self) -> BarContext:
        """The current bar context."""
        if self._ctx is None:
            raise RuntimeError("no bar yet: state is only available from on_bar onwards")
        return self._ctx

    @property
    def time(self) -> datetime:
        """Current bar time (IST)."""
        return self.ctx.time

    @property
    def cash(self) -> float:
        """Cash, including unsettled sale proceeds (see :attr:`available_cash`)."""
        return self.ctx.cash

    @property
    def unsettled_cash(self) -> float:
        """CNC sale proceeds awaiting T+1 settlement (part of ``cash``; 0 without settlement)."""
        return self.ctx.unsettled_cash

    @property
    def available_cash(self) -> float:
        """Cash that new buys can spend: ``cash`` minus unsettled proceeds not yet creditable."""
        avail = self.ctx.available_cash
        return self.ctx.cash if avail is None else avail

    @property
    def equity(self) -> float:
        """Cash plus positions marked at the latest close."""
        return self.ctx.equity

    @property
    def session(self) -> SessionState:
        """Exchange session state at this bar."""
        return self.ctx.session

    @property
    def warmup(self) -> bool:
        """True while bars are warm-up (orders are ignored)."""
        return self.ctx.warmup

    @property
    def symbol(self) -> str:
        """The only symbol of the run (raises with several)."""
        return self._symbol(None)

    @property
    def positions(self) -> dict[str, Position]:
        """Position per symbol (flat ``Position`` for symbols never traded)."""
        return self._positions

    @property
    def position(self) -> Position:
        """Position of the only symbol of the run (raises with several)."""
        return self._positions[self._symbol(None)]

    def instrument(self, symbol: str | None = None) -> Instrument:
        """Exchange rules of ``symbol`` (equity cash defaults when not configured)."""
        return self._instruments.get(self._symbol(symbol), Instrument())

    def last_price(self, symbol: str | None = None) -> float:
        """Latest close of ``symbol``."""
        sym = self._symbol(symbol)
        bar = self.ctx.bars.get(sym)
        if bar is None:
            raise ValueError(f"no bar for {sym!r} yet")
        return bar.close

    def history(self, symbol: str | None = None, tf: str | None = None) -> Bars:
        """Closed bars of ``symbol`` (oldest first) at ``tf`` (default: the base timeframe).

        Higher timeframes (declared in ``extra_timeframes``) only ever contain bars that have
        completely closed, anchored to the exchange session; the current base bar is included
        in the base timeframe.
        """
        if self._history is None:
            raise RuntimeError("history is only available while running")
        return self._history(self._symbol(symbol), tf)

    def orders(self, symbol: str | None = None, role: str | None = None) -> list[Order]:
        """List active (open or pending) orders.

        Optionally filtered by symbol and role (entry, stop_loss, take_profit, square_off).
        """
        sym = None if symbol is None and len(self.symbols) != 1 else self._symbol(symbol)
        return [
            o
            for o in self.ctx.open_orders
            if (sym is None or o.symbol == sym) and (role is None or o.role == role)
        ]

    def log(self, message: str) -> None:
        """Record a line tagged with the bar time (``BacktestResult.logs`` / ``log_frame``)."""
        self._logs.append((self._ctx.time_ms if self._ctx else 0, str(message)))

    @contextmanager
    def group(self, name: str) -> Iterator[None]:
        """Tag every order placed inside the block with basket / group ``name``.

        ::

            with self.group("pair-HDFC-ICICI"):
                self.buy(10, "HDFCBANK")
                self.sell(12, "ICICIBANK")

        An explicit ``group=`` on an order wins. Results aggregate by group
        (``BacktestResult.groups``) and carry it on fills, orders and trades.
        """
        previous, self._group = self._group, str(name)
        try:
            yield
        finally:
            self._group = previous

    # -- orders ------------------------------------------------------------------------------

    def buy(self, qty: float, symbol: str | None = None, **kwargs: Any) -> OrderHandle | None:
        """Buy ``qty`` (see :meth:`order` for the keyword arguments)."""
        return self.order("buy", qty, symbol, **kwargs)

    def sell(self, qty: float, symbol: str | None = None, **kwargs: Any) -> OrderHandle | None:
        """Sell ``qty`` (see :meth:`order` for the keyword arguments)."""
        return self.order("sell", qty, symbol, **kwargs)

    def order(
        self,
        side: str,
        qty: float,
        symbol: str | None = None,
        *,
        limit: float | None = None,
        stop: float | None = None,
        kind: str | None = None,
        tif: str | None = None,
        product: str | None = None,
        tag: str | None = None,
        stop_loss: float | Sequence[Leg | Mapping[str, Any]] | None = None,
        take_profit: float | Sequence[Leg | Mapping[str, Any]] | None = None,
        trail: Trail | None = None,
        reduce_only: bool = False,
        id: str | None = None,
        group: str | None = None,
        move_sl_to_entry_after_first_tp: bool = False,
    ) -> OrderHandle | None:
        """Place an order and return its handle.

        ``None`` is returned when nothing was sent: ``qty`` below one lot, or warm-up (the order
        is refused with a ``Reject`` (reason ``warmup``) delivered to ``on_reject`` next bar).

        The kind follows the prices: none is a market order, ``limit`` a limit, ``stop`` a
        stop-market (SL-M), both a stop-limit (SL); ``kind`` forces one. ``tif`` is ``day``
        (default), ``ioc`` or ``gtc``; ``product`` defaults to the class ``product``.
        ``stop_loss`` / ``take_profit`` attach OCO exits that go live when the entry fills;
        ``trail`` (a :class:`Trail`) makes the attached stop trail the price, or on a
        stop order without ``stop_loss`` trails its own trigger. Prices are rounded to the
        tick and ``qty`` down to whole lots. ``group`` tags the order (and its attached exits)
        with a basket name for reporting; see :meth:`group`. Entries are gated by
        :meth:`filters`.

        Partial exits: ``stop_loss`` / ``take_profit`` also take a list of legs
        (:class:`~honba.Leg` or ``{"price", "qty" | "pct"}`` dicts): leg quantities are lot
        multiples summing to at most ``qty``, a leg without ``qty`` / ``pct`` takes the rest.
        Each side covers the entry's open quantity, so a single stop loss protects whatever the
        target legs leave. ``move_sl_to_entry_after_first_tp=True`` moves the stop to the entry
        price once the first target fills (a ``StopUpdate`` event, ``on_stop_update``). A
        ``trail`` cannot be combined with several stop-loss legs. Needs the ``partial_exits``
        engine capability.
        """
        if side not in ("buy", "sell"):
            raise ValueError("side must be 'buy' or 'sell'")
        if not qty > 0 or not math.isfinite(qty):
            raise ValueError(f"qty must be positive, got {qty!r}")
        if trail is not None and not isinstance(trail, Trail):
            raise TypeError("trail must be a honba.Trail (Trail.percent(1.5), Trail.atr(2), ...)")
        sym = self._symbol(symbol)
        kind = self._kind(kind, limit, stop, trail, stop_loss)
        inst = self.instrument(sym)
        lots = abs(inst.round_qty(qty))
        if lots <= 0:
            self.log(f"skipped {side} {sym}: qty {qty:g} is below one lot ({inst.lot_size:g})")
            return None
        if not reduce_only:
            lots = self._apply_filters(sym, side, lots)
            if lots <= 0:
                return None
        sl_level = self._exit_level("stop_loss", stop_loss, inst, lots, sym)
        tp_level = self._exit_level("take_profit", take_profit, inst, lots, sym)
        if isinstance(sl_level, tuple) and trail is not None:
            raise ValueError(
                "trail cannot be combined with stop_loss legs (the engine rejects it as "
                "unsupported_trail): use one stop_loss level, or trail without legs"
            )
        if move_sl_to_entry_after_first_tp and (sl_level is None or tp_level is None):
            raise ValueError("move_sl_to_entry_after_first_tp needs stop_loss and take_profit")
        order_id = id or self._next_id()
        action = PlaceOrder(
            order_id,
            sym,
            side,  # type: ignore[arg-type]
            lots,
            kind,  # type: ignore[arg-type]
            None if limit is None else inst.round_price(limit),
            None if stop is None else inst.round_price(stop),
            tif,
            product or self.product,
            tag,
            sl_level,
            tp_level,
            trail,
            reduce_only,
            move_sl_to_entry_after_first_tp,
        )
        handle = self._submit(action, sym)
        tag_group = group if group is not None else self._group
        if handle is not None and tag_group is not None:
            self._groups[order_id] = str(tag_group)
        return handle

    def target(
        self,
        symbol: str | None = None,
        qty: float | None = None,
        *,
        pct: float | None = None,
        **kwargs: Any,
    ) -> OrderHandle | None:
        """Smart order: trade whatever it takes to hold a target position.

        ``qty`` is the signed target quantity (negative = short, 0 = flat); ``pct`` a signed
        fraction of equity at the latest close (0.1 = 10% long). Resting entry orders of the
        symbol are cancelled first (so repeated calls never double up), then only the delta to
        the current position is sent. Returns ``None`` when already there. Keyword arguments
        go to :meth:`order` (tag, product, tif, limit, ...).
        """
        return self._target(self._symbol(symbol), qty, pct, True, kwargs)

    def close(self, symbol: str | None = None, **kwargs: Any) -> OrderHandle | None:
        """Flatten ``symbol``: cancel its resting entries and sell/buy the position out."""
        return self._target(self._symbol(symbol), 0.0, None, True, kwargs)

    def close_all(self, **kwargs: Any) -> list[OrderHandle]:
        """Cancel every open order and flatten every position."""
        self._emit(CancelAll())
        handles = [
            self._target(sym, 0.0, None, False, dict(kwargs))
            for sym in self.symbols
            if self._positions[sym].is_open or self._queued_net.get(sym)
        ]
        return [h for h in handles if h is not None]

    def modify(
        self,
        order: OrderHandle | Order | str,
        *,
        qty: float | None = None,
        limit: float | None = None,
        stop: float | None = None,
        tif: str | None = None,
        stop_loss: float | Sequence[Leg | Mapping[str, Any]] | None = None,
        take_profit: float | Sequence[Leg | Mapping[str, Any]] | None = None,
        trail: Trail | None = None,
        tag: str | None = None,
    ) -> None:
        """Change an open order.

        To move the stop of a live position modify its exit order:
        ``self.modify(handle.stop_order, stop=new_level)``; for an unfilled entry pass
        ``stop_loss`` / ``take_profit`` / ``trail``. ``None`` leaves a field unchanged. A level
        moves every working leg of that side; a list of legs replaces them (the old legs are
        cancelled with reason ``replaced``).
        """
        order_id = order if isinstance(order, str) else order.id
        inst = self._instruments.get(self._order_symbol(order), Instrument())
        rnd = inst.round_price
        sym = self._order_symbol(order)
        self._emit(
            ModifyOrder(
                order_id,
                None if qty is None else abs(inst.round_qty(qty)) or qty,
                None if limit is None else rnd(limit),
                None if stop is None else rnd(stop),
                tif,
                self._exit_level("stop_loss", stop_loss, inst, None, sym),
                self._exit_level("take_profit", take_profit, inst, None, sym),
                trail,
                tag,
            )
        )

    def cancel(self, order: OrderHandle | Order | str) -> None:
        """Cancel one order."""
        self._emit(CancelOrder(order if isinstance(order, str) else order.id))

    def cancel_all(self, symbol: str | None = None) -> None:
        """Cancel every open order (of ``symbol`` when given)."""
        self._emit(CancelAll(symbol))

    # -- internals ---------------------------------------------------------------------------

    def _symbol(self, symbol: str | None) -> str:
        if symbol is not None:
            return symbol
        if len(self.symbols) == 1:
            return self.symbols[0]
        raise ValueError(f"symbol is required with several symbols {list(self.symbols)}")

    @staticmethod
    def _exit_level(
        name: str, value: Any, inst: Instrument, qty: float | None, sym: str
    ) -> ExitLevel | None:
        """A price, or validated :class:`Leg` tuple, rounded to the tick (``qty``: entry size)."""
        if value is None:
            return None
        if isinstance(value, (int, float)):
            return inst.round_price(value)
        legs = tuple(Leg.of(leg) for leg in value)
        if not legs:
            raise ValueError(f"{name} needs at least one leg")
        legs = tuple(Leg(inst.round_price(leg.price), leg.qty, leg.pct) for leg in legs)
        if sum(1 for leg in legs if leg.qty is None and leg.pct is None) > 1:
            raise ValueError(f"{name}: at most one leg may omit qty and pct (it takes the rest)")
        if sum(leg.pct or 0.0 for leg in legs) > 100.0 + _LOT_EPS:
            raise ValueError(f"{name}: leg pct values add up to more than 100")
        for leg in legs:
            if leg.qty is not None and abs(inst.round_qty(leg.qty) - leg.qty) > _LOT_EPS:
                raise ValueError(
                    f"{name} leg qty {leg.qty:g} is not a multiple of the lot size "
                    f"{inst.lot_size:g} of {sym or 'the symbol'}"
                )
        if qty is not None:
            fixed = sum(leg.qty or 0.0 for leg in legs)
            pct = sum(inst.round_qty(qty * leg.pct / 100.0) for leg in legs if leg.pct)
            if fixed + pct > qty + _LOT_EPS:
                raise ValueError(f"{name} legs cover {fixed + pct:g} but the order is for {qty:g}")
        return legs

    def _next_id(self) -> str:
        self._seq += 1
        return f"s{self._seq}"

    @staticmethod
    def _kind(
        kind: str | None,
        limit: float | None,
        stop: float | None,
        trail: Trail | None,
        stop_loss: float | None,
    ) -> str:
        inferred = (
            "market"
            if limit is None and stop is None
            else "limit"
            if stop is None
            else "stop"
            if limit is None
            else "stop_limit"
        )
        if trail is not None and stop is None and limit is None and stop_loss is None:
            inferred = "stop"  # trailing stop entry: trail its own trigger
        if kind is None:
            return inferred
        if kind not in ("market", "limit", "stop", "stop_limit"):
            raise ValueError(f"kind must be market, limit, stop or stop_limit, got {kind!r}")
        if kind != inferred and not (kind == "stop" and trail is not None):
            raise ValueError(f"kind={kind!r} does not match the prices given (limit/stop)")
        return kind

    def _apply_filters(self, sym: str, side: str, lots: float) -> float:
        """Quantity that may be sent once entry filters ran (0 = blocked)."""
        checks = self.filters()
        if not checks:
            return lots
        current = self._positions[sym].qty + self._queued_net.get(sym, 0.0)
        signed = lots if side == "buy" else -lots
        if abs(current) > _LOT_EPS and current * signed < 0:
            if lots <= abs(current) + _LOT_EPS:
                return lots  # pure exit / reduction
            closing = abs(current)  # reversal: the part beyond flat is an entry
        else:
            closing = 0.0
        for check in checks:
            if not self._call_filter(check, sym, side):
                name = getattr(check, "__name__", type(check).__name__)
                if closing:
                    self.log(f"filter {name} blocked the reversal of {sym}: exit only")
                    return closing
                self.log(f"filter {name} blocked {side} {lots:g} {sym}")
                return 0.0
        return lots

    @staticmethod
    def _call_filter(check: Callable[..., bool], sym: str, side: str) -> bool:
        try:
            takes_args = len(inspect.signature(check).parameters) > 0
        except (TypeError, ValueError):
            takes_args = False
        return bool(check(sym, side) if takes_args else check())

    def _submit(self, action: PlaceOrder, sym: str) -> OrderHandle | None:
        if self._ctx is not None and self._ctx.warmup:
            # Warm-up bars feed history only: surface the refusal like an engine reject.
            self._pending_rejects.append(
                Reject(
                    self._ctx.time_ms, action.id, sym, action.side, action.qty, RejectReason.WARMUP
                )
            )
            self._terminal[action.id] = "rejected"
            return None
        if not self._emit(action):
            return None
        self._order_symbols[action.id] = sym
        sign = 1.0 if action.side == "buy" else -1.0
        self._queued_net[sym] = self._queued_net.get(sym, 0.0) + sign * action.qty
        return OrderHandle(self, action.id, sym)

    def _emit(self, action: Action) -> bool:
        if self._ctx is not None and self._ctx.warmup:
            return False  # cancel / modify during warm-up have nothing to act on
        if self._caps is not None:
            self._caps.check(
                required_features(action),
                f"{type(self).__name__}.{type(action).__name__}",
            )
        self._queue.append(action)
        return True

    def _target(
        self,
        sym: str,
        qty: float | None,
        pct: float | None,
        cancel_pending: bool,
        kwargs: dict[str, Any],
    ) -> OrderHandle | None:
        if (qty is None) == (pct is None):
            raise ValueError("give exactly one of qty= or pct=")
        inst = self.instrument(sym)
        if pct is not None:
            price = self.last_price(sym)
            qty = math.copysign(inst.round_qty(pct * self.equity / price), pct)
        else:
            assert qty is not None
            qty = math.copysign(inst.round_qty(qty), qty)
        if cancel_pending:
            for o in self.orders(sym, "entry"):
                if o.status in ("open", "partially_filled"):
                    self.cancel(o)
        current = self._positions[sym].qty + self._queued_net.get(sym, 0.0)
        delta = qty - current
        if abs(delta) < inst.lot_size - _LOT_EPS:
            return None
        reducing = abs(current) > _LOT_EPS and delta * current < 0
        if reducing and "product" not in kwargs:
            kwargs["product"] = self._positions[sym].product
        return self.order("buy" if delta > 0 else "sell", abs(delta), sym, **kwargs)

    def _order_symbol(self, order: OrderHandle | Order | str) -> str:
        if not isinstance(order, str):
            return order.symbol
        base = order.split(":")[0]
        if base in self._order_symbols:
            return self._order_symbols[base]
        for o in self._ctx.open_orders if self._ctx else ():
            if o.id == order:
                return o.symbol
        return ""

    def _open_order(self, order_id: str) -> Order | None:
        for o in self._ctx.open_orders if self._ctx else ():
            if o.id == order_id:
                return o
        return None

    def _status_of(self, order_id: str) -> str:
        found = self._open_order(order_id)
        if found is not None:
            return found.status
        return self._terminal.get(order_id, "submitted")

    def _bar_of(self, symbol: str) -> Bar | None:
        return self.ctx.bars.get(symbol)
