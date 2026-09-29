"""Engine-neutral value types shared by strategies, engines and results.

These are the SDK's own vocabulary. Engines translate to and from them (the barter engine in
``honba.research._barter_adapter``); nothing here refers to any engine's wire format.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum
from datetime import UTC, datetime, timedelta, timezone
from typing import Literal

__all__ = [
    "CancelReason",
    "FillReason",
    "RejectReason",
    "CNC",
    "IST",
    "MIS",
    "MTF",
    "NRML",
    "Bar",
    "BarContext",
    "Cancel",
    "Costs",
    "Fill",
    "Order",
    "Position",
    "Reject",
    "RoundTrip",
    "SessionState",
    "Trail",
    "TrailUpdate",
]

IST = timezone(timedelta(hours=5, minutes=30), "IST")

Side = Literal["buy", "sell"]
Product = Literal["CNC", "MIS", "NRML", "MTF"]
CNC: Product = "CNC"
MIS: Product = "MIS"
NRML: Product = "NRML"
MTF: Product = "MTF"

_EPS = 1e-9


class RejectReason(StrEnum):
    """Reason codes of :class:`Reject` events (engines may add others; those stay plain str)."""

    UNKNOWN_SYMBOL = "unknown_symbol"
    INVALID_QTY = "invalid_qty"
    INVALID_PRICE = "invalid_price"
    INVALID_TRIGGER = "invalid_trigger"
    INVALID_STOP_LOSS = "invalid_stop_loss"
    INVALID_TAKE_PROFIT = "invalid_take_profit"
    INVALID_TRAIL = "invalid_trail"
    UNSUPPORTED_TRAIL = "unsupported_trail"
    INVALID_LOT = "invalid_lot"
    INVALID_TICK = "invalid_tick"
    ABOVE_FREEZE_QTY = "above_freeze_qty"
    NO_PRICE = "no_price"
    NO_BAR = "no_bar"  # market order on a symbol without a bar at this timestamp
    NO_POSITION = "no_position"  # exit change on an entry whose position is closed
    DUPLICATE_ID = "duplicate_id"
    UNKNOWN_ORDER = "unknown_order"
    ORDER_CLOSED = "order_closed"
    NOT_AN_ENTRY = "not_an_entry"
    MARKET_CLOSED = "market_closed"
    AFTER_SQUARE_OFF = "after_square_off"  # new MIS exposure after the square-off time
    WARMUP = "warmup"
    INSUFFICIENT_CASH = "insufficient_cash"
    INSUFFICIENT_MARGIN = "insufficient_margin"
    INSUFFICIENT_POSITION = "insufficient_position"


class CancelReason(StrEnum):
    """Reason codes of :class:`Cancel` events (``expire`` kinds use ``DAY`` / ``IOC``)."""

    USER = "user"
    OCO = "oco"
    POSITION_CLOSED = "position_closed"
    PARENT_CLOSED = "parent_closed"
    SQUARE_OFF = "square_off"
    END_OF_DATA = "end_of_data"
    DAY = "day"
    IOC = "ioc"


class FillReason(StrEnum):
    """Why a fill happened (``Fill.reason``)."""

    SIGNAL = "signal"
    LIMIT = "limit"
    STOP = "stop"
    STOP_LOSS = "stop_loss"
    TAKE_PROFIT = "take_profit"
    TRAILING_STOP = "trailing_stop"
    SQUARE_OFF = "square_off"
    LIQUIDATE_END = "liquidate_end"  # end-of-data flatten


def _coerce(enum: type[StrEnum], value: str) -> str:
    try:
        return enum(value)
    except ValueError:
        return value


def _ist(time_ms: int) -> datetime:
    return datetime.fromtimestamp(time_ms / 1000.0, tz=UTC).astimezone(IST)


@dataclass(frozen=True, slots=True)
class Bar:
    """One OHLCV candle. ``time_ms`` is the bar's open time (epoch milliseconds)."""

    time_ms: int
    open: float
    high: float
    low: float
    close: float
    volume: float = 0.0

    @property
    def time(self) -> datetime:
        """Open time as an IST datetime."""
        return _ist(self.time_ms)


@dataclass(frozen=True, slots=True)
class Costs:
    """Transaction costs of a fill, per component (quote currency)."""

    brokerage: float = 0.0
    stt: float = 0.0
    exchange_fee: float = 0.0
    sebi_fee: float = 0.0
    stamp_duty: float = 0.0
    gst: float = 0.0
    dp: float = 0.0
    total: float = 0.0


@dataclass(frozen=True, slots=True)
class Trail:
    """Trailing-stop parameters (engine-native; the engine ratchets the stop every bar).

    ``mode`` is ``"percent"`` (``value`` percent of the extreme price), ``"amount"`` (price
    units) or ``"atr"`` (``value`` x ATR(``atr_period``)). Trailing starts once price trades
    through ``activation`` and the stop only moves when it improves by at least ``step``.
    """

    mode: Literal["percent", "amount", "atr"]
    value: float
    atr_period: int | None = None
    activation: float | None = None
    step: float | None = None

    def __post_init__(self) -> None:
        if self.mode not in ("percent", "amount", "atr"):
            raise ValueError(f"trail mode must be percent, amount or atr, got {self.mode!r}")
        if not self.value > 0:
            raise ValueError("trail value must be positive")

    @classmethod
    def percent(
        cls, value: float, *, activation: float | None = None, step: float | None = None
    ) -> Trail:
        """Trail ``value`` percent behind the best price."""
        return cls("percent", value, activation=activation, step=step)

    @classmethod
    def amount(
        cls, value: float, *, activation: float | None = None, step: float | None = None
    ) -> Trail:
        """Trail ``value`` price units behind the best price."""
        return cls("amount", value, activation=activation, step=step)

    @classmethod
    def atr(
        cls,
        mult: float,
        period: int = 14,
        *,
        activation: float | None = None,
        step: float | None = None,
    ) -> Trail:
        """Trail ``mult`` x ATR(``period``) behind the best price."""
        return cls("atr", mult, atr_period=period, activation=activation, step=step)


@dataclass(frozen=True, slots=True)
class Position:
    """Position in one symbol (``qty`` is signed: positive long, negative short)."""

    qty: float = 0.0
    avg_price: float = 0.0
    product: str | None = None
    realised_pnl: float = 0.0
    unrealised_pnl: float = 0.0
    pnl: float = 0.0

    @property
    def is_long(self) -> bool:
        """True when net long."""
        return self.qty > _EPS

    @property
    def is_short(self) -> bool:
        """True when net short."""
        return self.qty < -_EPS

    @property
    def is_flat(self) -> bool:
        """True when no position is held."""
        return abs(self.qty) <= _EPS

    @property
    def is_open(self) -> bool:
        """True when a position is held."""
        return not self.is_flat


@dataclass(frozen=True, slots=True)
class Order:
    """An order as reported by the engine (open, pending or in the final report)."""

    id: str
    symbol: str
    side: Side
    kind: str
    qty: float
    filled_qty: float = 0.0
    avg_fill_price: float | None = None
    price: float | None = None
    trigger: float | None = None
    tif: str = "day"
    product: str | None = None
    tag: str | None = None
    role: str = "entry"
    parent: str | None = None
    status: str = "open"
    reason: str | None = None
    stop_loss: float | None = None
    take_profit: float | None = None
    trail: Trail | None = None
    trail_stop: float | None = None
    created_ms: int = 0
    updated_ms: int = 0

    @property
    def remaining(self) -> float:
        """Unfilled quantity."""
        return max(self.qty - self.filled_qty, 0.0)

    @property
    def signed_remaining(self) -> float:
        """Unfilled quantity, positive for buys and negative for sells."""
        return self.remaining if self.side == "buy" else -self.remaining

    @property
    def is_active(self) -> bool:
        """True while the order can still fill (open, or an exit waiting for its entry)."""
        return self.status in ("open", "pending")


@dataclass(frozen=True, slots=True)
class Fill:
    """An execution.

    ``reason`` is signal, limit, stop, stop_loss, take_profit, trailing_stop or square_off.
    ``realised_pnl`` is gross of costs (costs are in ``costs.total``).
    """

    time_ms: int
    order_id: str
    fill_id: str
    symbol: str
    side: Side
    qty: float
    price: float
    value: float = 0.0
    costs: Costs = field(default_factory=Costs)
    realised_pnl: float = 0.0
    product: str | None = None
    tag: str | None = None
    reason: str = "signal"

    @property
    def time(self) -> datetime:
        """Fill time as an IST datetime."""
        return _ist(self.time_ms)

    @property
    def signed_qty(self) -> float:
        """Positive for buys, negative for sells."""
        return self.qty if self.side == "buy" else -self.qty


@dataclass(frozen=True, slots=True)
class Cancel:
    """An order was cancelled (``kind == "cancel"``) or expired (``"expire"``)."""

    kind: Literal["cancel", "expire"]
    time_ms: int
    id: str
    symbol: str
    reason: str


@dataclass(frozen=True, slots=True)
class Reject:
    """The engine refused an order or an operation (``reason`` is the engine reason code)."""

    time_ms: int
    id: str | None
    symbol: str
    side: Side | None
    qty: float
    reason: RejectReason | str

    def __post_init__(self) -> None:
        object.__setattr__(self, "reason", _coerce(RejectReason, self.reason))


@dataclass(frozen=True, slots=True)
class TrailUpdate:
    """The engine moved a trailing stop."""

    time_ms: int
    id: str
    symbol: str
    old_stop: float | None
    new_stop: float


Event = Fill | Cancel | Reject | TrailUpdate


@dataclass(frozen=True, slots=True)
class SessionState:
    """Exchange session state at the bar."""

    is_open: bool = True
    date: str = ""
    minutes_to_close: int | None = None


@dataclass(frozen=True, slots=True)
class RoundTrip:
    """A completed position lifecycle (flat -> position -> flat), built from fills.

    ``gross_pnl`` is the sum of the fills' realised PnL, ``costs`` the transaction costs of all
    fills that belong to the trip, ``pnl`` is net (``gross_pnl - costs``).
    """

    symbol: str
    side: Literal["long", "short"]
    qty: float
    entry_time_ms: int
    exit_time_ms: int
    entry_price: float
    exit_price: float
    gross_pnl: float
    costs: float
    entry_tag: str | None = None
    exit_tag: str | None = None
    exit_reason: str = "signal"
    product: str | None = None
    fills: int = 2

    @property
    def pnl(self) -> float:
        """Net PnL after costs."""
        return self.gross_pnl - self.costs

    @property
    def return_pct(self) -> float:
        """Net PnL as a fraction of the capital committed at entry."""
        base = self.entry_price * self.qty
        return self.pnl / base if base else 0.0

    @property
    def holding(self) -> timedelta:
        """Time between the first entry fill and the closing fill."""
        return timedelta(milliseconds=self.exit_time_ms - self.entry_time_ms)

    @property
    def entry_time(self) -> datetime:
        """Entry time as an IST datetime."""
        return _ist(self.entry_time_ms)

    @property
    def exit_time(self) -> datetime:
        """Exit time as an IST datetime."""
        return _ist(self.exit_time_ms)


@dataclass(frozen=True, slots=True)
class BarContext:
    """Everything the engine reports at one bar timestamp.

    ``bars`` holds the latest bar of every symbol (a symbol without a bar at ``time_ms`` keeps
    its older bar; check ``bar.time_ms == ctx.time_ms``). ``events`` are the fills, cancels,
    rejects and trail moves since the previous bar, in order.
    """

    time_ms: int
    warmup: bool
    cash: float
    equity: float
    bars: dict[str, Bar]
    positions: dict[str, Position]
    open_orders: tuple[Order, ...]
    events: tuple[Event, ...]
    session: SessionState

    @property
    def time(self) -> datetime:
        """Bar time as an IST datetime."""
        return _ist(self.time_ms)

    @property
    def bar(self) -> Bar:
        """The latest bar when there is exactly one symbol."""
        if len(self.bars) != 1:
            raise ValueError("ctx.bar needs a single symbol; use ctx.bars[symbol]")
        return next(iter(self.bars.values()))
