"""Engine-neutral backtest configuration."""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from datetime import date, datetime
from typing import Literal

from honba.strategy.market import Instrument, TradingSession
from honba.strategy.types import IST

__all__ = ["BacktestConfig", "CostModel"]


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
    (raise on bad candles), ``"warn"`` (warn) or ``"off"``.
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
    validation: Literal["error", "warn", "off"] = "error"
    sort_candles: bool = False

    def __post_init__(self) -> None:
        if not self.capital > 0:
            raise ValueError("capital must be positive")
        if self.trading_days_per_year < 1:
            raise ValueError("trading_days_per_year must be >= 1")
        if self.warmup_bars < 0:
            raise ValueError("warmup_bars must be >= 0")

    def with_(self, **changes: object) -> BacktestConfig:
        """Copy with fields replaced."""
        return replace(self, **changes)  # type: ignore[arg-type]

    @property
    def start_ms(self) -> int | None:
        """``start`` as epoch milliseconds."""
        return None if self.start is None else _to_ms(self.start)
