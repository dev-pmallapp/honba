"""Engine-neutral backtest configuration."""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from datetime import date, datetime
from typing import Literal

from honba.strategy.market import Instrument, TradingSession
from honba.strategy.types import IST

__all__ = ["BacktestConfig", "CostModel", "MarginConfig", "Settlement", "Slippage"]


# Conservative all-in rate for the value-proportional Indian buy-side charges (STT 0.1%,
# stamp duty 0.015%, exchange / SEBI fees, GST on fees) with headroom.
_INDIA_BUY_RATE = 0.0025


@dataclass(frozen=True, slots=True)
class CostModel:
    """Transaction costs.

    ``flat`` charges ``pct`` percent of traded value; ``india`` applies STT, exchange, SEBI,
    stamp duty and GST plus brokerage (``per_order`` / ``pct``).
    """

    model: Literal["flat", "india"] = "flat"
    pct: float = 0.0
    per_order: float = 20.0
    brokerage_pct: float = 0.03
    cnc_free: bool = True
    dp_per_sell: float = 0.0
    table: str | None = None

    def estimate_buy(self, value: float) -> float:
        """Upper-bound estimate of the costs of buying ``value`` (for cash-capped sizing)."""
        if self.model == "flat":
            return value * self.pct / 100.0
        brokerage = min(self.per_order, value * self.brokerage_pct / 100.0)
        return value * _INDIA_BUY_RATE + brokerage * 1.18

    @classmethod
    def flat(cls, pct: float = 0.0) -> CostModel:
        """``pct`` percent of traded value per fill (0.03 = 0.03%)."""
        return cls("flat", pct=pct)

    @classmethod
    def india(
        cls,
        per_order: float = 20.0,
        brokerage_pct: float = 0.03,
        *,
        cnc_free: bool = True,
        dp_per_sell: float = 0.0,
        table: str | None = None,
    ) -> CostModel:
        """Indian statutory charges plus discount-broker brokerage.

        Brokerage is the lower of ``per_order`` and ``brokerage_pct`` percent (free on CNC when
        ``cnc_free``).
        """
        return cls(
            "india",
            per_order=per_order,
            brokerage_pct=brokerage_pct,
            cnc_free=cnc_free,
            dp_per_sell=dp_per_sell,
            table=table,
        )


@dataclass(frozen=True, slots=True)
class MarginConfig:
    """Margin required to open exposure (buying power = equity - margin of open positions).

    ``mis_leverage`` divides the notional for MIS (5 = 20% margin); ``nrml_margin_pct`` is the
    margin percent of NRML / MTF positions (about 15-20 for futures); ``short_margin_pct`` that
    of short positions. CNC always needs the full value. Defaults: no leverage.
    """

    mis_leverage: float = 1.0
    nrml_margin_pct: float = 100.0
    short_margin_pct: float = 100.0

    def __post_init__(self) -> None:
        if not self.mis_leverage >= 1 or not 0 < self.nrml_margin_pct <= 1000:
            raise ValueError("mis_leverage must be >= 1 and nrml_margin_pct in (0, 1000]")
        if not 0 < self.short_margin_pct <= 1000:
            raise ValueError("short_margin_pct must be in (0, 1000]")


@dataclass(frozen=True, slots=True)
class Settlement:
    """Settlement of delivery (CNC) trades: when sale proceeds and purchases become usable.

    ``cnc="T+0"`` (default) settles at once. ``"T+1"``: CNC sale proceeds settle at the first bar
    of a later trading date; until then only ``same_day_sell_credit`` (a fraction, broker
    dependent) of them can fund new buys, the rest counts as ``unsettled_cash`` and is missing
    from ``available_cash``. CNC purchases become holdings (``Position.qty_settled``) on the next
    trading date; selling them earlier (BTST) is allowed.
    """

    cnc: Literal["T+0", "T+1"] = "T+0"
    same_day_sell_credit: float = 1.0

    def __post_init__(self) -> None:
        if self.cnc not in ("T+0", "T+1"):
            raise ValueError(f"settlement cnc must be 'T+0' or 'T+1', got {self.cnc!r}")
        if not 0 <= self.same_day_sell_credit <= 1:
            raise ValueError("same_day_sell_credit must be in [0, 1]")


@dataclass(frozen=True, slots=True)
class Slippage:
    """Adverse price movement on market-like fills and the bar-volume participation cap.

    Build with :meth:`bps` or :meth:`volume_share`. Slippage moves market, stop-market, stop-loss
    and trailing exits, square-off and end-of-data fills against the order (buys up, sells down,
    rounded to the tick away from the market); limit, take-profit and stop-limit fills are never
    worse than their limit and get none. ``max_volume_share`` caps what all orders of a symbol
    together may fill per bar (a fraction of the bar's volume, rounded down to lots): the rest of
    an order keeps working (order status ``partially_filled``, fills report ``remaining_qty``).
    Bars without volume are not capped.
    """

    model: Literal["bps", "volume_share"] = "bps"
    base_bps: float = 0.0
    impact_bps: float = 0.0
    max_volume_share: float | None = None

    def __post_init__(self) -> None:
        if self.model not in ("bps", "volume_share"):
            raise ValueError(f"slippage model must be bps or volume_share, got {self.model!r}")
        if self.base_bps < 0 or self.impact_bps < 0:
            raise ValueError("slippage bps must be >= 0")
        if self.max_volume_share is not None and not 0 < self.max_volume_share <= 1:
            raise ValueError("max_volume_share must be in (0, 1]")

    @classmethod
    def bps(cls, bps: float, *, max_volume_share: float | None = None) -> Slippage:
        """A fixed adverse offset of ``bps`` basis points (1 bp = 0.01%) of the fill price."""
        return cls("bps", base_bps=bps, max_volume_share=max_volume_share)

    @classmethod
    def volume_share(
        cls, bps: float = 0.0, impact_bps: float = 0.0, max_volume_share: float | None = None
    ) -> Slippage:
        """``bps`` plus ``impact_bps`` x (fill qty / bar volume), capped at ``max_volume_share``."""
        return cls(
            "volume_share", base_bps=bps, impact_bps=impact_bps, max_volume_share=max_volume_share
        )


def _to_ms(value: datetime | date | str | int | float) -> int:
    if isinstance(value, (int, float)):
        return int(value if value >= 10**11 else value * 1000)
    if isinstance(value, str):
        value = datetime.fromisoformat(value)
    if isinstance(value, datetime):
        value = value if value.tzinfo else value.replace(tzinfo=IST)
        return int(value.timestamp() * 1000)
    return int(datetime(value.year, value.month, value.day, tzinfo=IST).timestamp() * 1000)


@dataclass(frozen=True, slots=True)
class BacktestConfig:
    """Everything about a backtest except the strategy and the data.

    ``session`` is ``None`` (always open, right for daily bars) or a :class:`TradingSession`
    (``TradingSession()`` is the NSE cash session: hours, holidays, MIS square-off, DAY expiry).
    ``start`` (a time, IST when naive) or ``warmup_bars`` (bars of the first symbol) mark the
    end of warm-up: bars before it feed indicators but place no orders and are not measured.
    ``timeframe`` overrides the strategy's base timeframe. ``validation`` is ``"error"``
    (raise on bad candles), ``"warn"`` (warn) or ``"off"``. ``slippage`` (a :class:`Slippage`)
    adds adverse fill prices and a volume participation cap (partial fills). ``freeze_policy``
    decides what happens to orders above an instrument's ``freeze_qty``: ``"reject"`` (reason
    ``above_freeze_qty``) or ``"split"`` (the engine executes them as freeze-sized, lot-multiple
    child orders; fills carry ``slice`` and every slice pays its own costs). Engines without
    native splitting (``freeze_split`` capability) raise ``UnsupportedFeature`` for ``"split"``:
    slice the order yourself with :func:`honba.split_order`. ``settlement`` (a
    :class:`Settlement`, default ``None`` = T+0) enables T+1 delivery settlement.
    """

    capital: float = 1_000_000.0
    costs: CostModel = field(default_factory=CostModel)
    fill: Literal["close", "next_open"] = "close"
    intrabar: Literal["stop_first", "target_first"] = "stop_first"
    allow_short: bool = False
    latency_ms: int = 0
    risk_free_return: float = 0.0
    trading_days_per_year: int = 250
    exchange: str = "NSE"
    quote: str = "INR"
    session: TradingSession | None = None
    instruments: dict[str, Instrument] = field(default_factory=dict)
    start: datetime | date | str | int | None = None
    warmup_bars: int = 0
    timeframe: str | None = None
    liquidate_at_end: bool = False
    margin: MarginConfig = field(default_factory=MarginConfig)
    attached_exit_same_bar: bool = False
    slippage: Slippage | None = None
    freeze_policy: Literal["reject", "split"] = "reject"
    settlement: Settlement | None = None
    validation: Literal["error", "warn", "off"] = "error"
    sort_candles: bool = False

    def __post_init__(self) -> None:
        if not self.capital > 0:
            raise ValueError("capital must be positive")
        if self.trading_days_per_year < 1:
            raise ValueError("trading_days_per_year must be >= 1")
        if self.warmup_bars < 0:
            raise ValueError("warmup_bars must be >= 0")
        if self.freeze_policy not in ("reject", "split"):
            raise ValueError(f"freeze_policy must be reject or split, got {self.freeze_policy!r}")

    def with_(self, **changes: object) -> BacktestConfig:
        """Copy with fields replaced."""
        return replace(self, **changes)  # type: ignore[arg-type]

    @property
    def start_ms(self) -> int | None:
        """``start`` as epoch milliseconds."""
        return None if self.start is None else _to_ms(self.start)
