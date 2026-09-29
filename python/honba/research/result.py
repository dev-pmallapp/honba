"""``BacktestResult``: SDK-typed view of one run (report + round trips + metrics)."""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from functools import cached_property
from typing import Any

import pandas as pd

from honba.strategy.roundtrip import round_trips_from_fills
from honba.strategy.types import IST, Fill, Order, Position, Reject, RoundTrip

from .config import BacktestConfig
from .engine import BacktestReport
from .metrics import Metrics, compute_metrics, drawdown_series
from .montecarlo import MonteCarloResult, monte_carlo_trades

__all__ = ["BacktestResult"]

_SDK_KEYS = ("win_rate", "profit_factor", "sharpe", "sortino", "calmar", "cagr", "max_drawdown")
_COST_FIELDS = ("brokerage", "stt", "exchange_fee", "sebi_fee", "stamp_duty", "gst", "dp")


def _time_index(ms: list[int] | pd.Series) -> pd.DatetimeIndex:
    return pd.to_datetime(list(ms), unit="ms", utc=True).tz_convert(IST)


@dataclass
class BacktestResult:
    """Result of :func:`honba.backtest`.

    ``report`` is the engine-neutral :class:`BacktestReport` and ``raw`` the engine's own
    untouched report. ``trades`` are round trips (Jesse's meaning of a trade); ``fills`` are the
    individual executions.
    """

    report: BacktestReport
    config: BacktestConfig
    params: dict[str, Any] = field(default_factory=dict)
    logs: list[tuple[int, str]] = field(default_factory=list)
    strategy: str = ""

    @property
    def raw(self) -> Any:
        """The engine's own report, untouched."""
        return self.report.raw

    @property
    def engine(self) -> str:
        """Name of the engine that produced the result."""
        return self.report.engine

    @property
    def summary(self) -> dict[str, Any]:
        """Portfolio summary: engine figures with the SDK's net metrics authoritative.

        Engine keys (``net_pnl``, ``total_return``, fees, counts, ``costs``) are kept. The
        risk / trade ratios (``win_rate``, ``profit_factor``, ``sharpe``, ``sortino``,
        ``calmar``, ``cagr``, ``max_drawdown``) come from :attr:`metrics`: net of costs,
        per round trip, one annualisation (``config.trading_days_per_year``). The engine's own
        values (gross, per fill, its annualisation) are under ``engine_<name>``.
        """
        out = self.report.summary.as_dict()
        for key in _SDK_KEYS:
            out[f"engine_{key}"] = out.get(key)
            out[key] = getattr(self.metrics, key)
        return out

    @cached_property
    def round_trips(self) -> list[RoundTrip]:
        """Completed round trips (net of costs).

        Taken from the engine when its report carries them, enriched with the entry / exit
        tags, exit reason and fill count rebuilt from fills; otherwise rebuilt from fills alone.
        """
        rebuilt = round_trips_from_fills(self.report.fills)
        if self.report.round_trips is None:
            return rebuilt
        extra = {(t.symbol, t.entry_time_ms, t.exit_time_ms): t for t in rebuilt}
        out = []
        for trip in self.report.round_trips:
            match = extra.get((trip.symbol, trip.entry_time_ms, trip.exit_time_ms))
            out.append(
                replace(
                    trip,
                    entry_tag=match.entry_tag if match else None,
                    exit_tag=match.exit_tag if match else None,
                    exit_reason=match.exit_reason if match else trip.exit_reason,
                    fills=match.fills if match else trip.fills,
                )
            )
        return out

    @cached_property
    def equity(self) -> pd.Series:
        """Equity by IST bar time (measured bars only)."""
        pts = self.report.equity_curve
        if not pts:
            return pd.Series(dtype=float, name="equity", index=_time_index([]))
        return pd.Series(
            [e for _, e in pts], index=_time_index([t for t, _ in pts]), name="equity", dtype=float
        )

    @cached_property
    def metrics(self) -> Metrics:
        """Jesse-style metrics (trade stats from round trips, risk ratios over 250 sessions)."""
        return compute_metrics(
            self.round_trips,
            self.equity,
            self.config.capital,
            self.config.risk_free_return,
            self.config.trading_days_per_year,
        )

    @property
    def equity_curve(self) -> pd.DataFrame:
        """DataFrame indexed by time with ``equity`` and ``drawdown`` (fraction, <= 0)."""
        eq = self.equity
        dd = drawdown_series(eq, self.config.capital) if len(eq) else eq
        return pd.DataFrame({"equity": eq, "drawdown": dd})

    @property
    def fills(self) -> pd.DataFrame:
        """Every execution as a DataFrame.

        Columns: time, order_id, symbol, side, qty, price, value, fees, cost components,
        realised_pnl (gross), product, tag, reason.
        """
        rows = [_fill_row(f) for f in self.report.fills]
        return _frame(rows, "time_ms")

    @property
    def trades(self) -> pd.DataFrame:
        """Round trips as a DataFrame.

        Columns: symbol, side, qty, entry/exit time and price, gross_pnl, costs, pnl (net),
        return_pct, holding, exit_reason, tags.
        """
        rows = [
            {
                "symbol": t.symbol,
                "side": t.side,
                "qty": t.qty,
                "entry_time": t.entry_time,
                "exit_time": t.exit_time,
                "entry_price": t.entry_price,
                "exit_price": t.exit_price,
                "gross_pnl": t.gross_pnl,
                "costs": t.costs,
                "pnl": t.pnl,
                "return_pct": t.return_pct,
                "holding": t.holding,
                "exit_reason": t.exit_reason,
                "entry_tag": t.entry_tag,
                "exit_tag": t.exit_tag,
                "product": t.product,
                "fills": t.fills,
            }
            for t in self.round_trips
        ]
        return pd.DataFrame(rows)

    @property
    def orders(self) -> pd.DataFrame:
        """Every accepted order with its final state."""
        rows = [_order_row(o) for o in self.report.orders]
        return pd.DataFrame(rows)

    @property
    def rejected(self) -> pd.DataFrame:
        """Rejected orders / operations with the engine reason."""
        rows = [_reject_row(r) for r in self.report.rejected]
        return _frame(rows, "time_ms")

    @property
    def positions(self) -> dict[str, Position]:
        """Final position per symbol."""
        return dict(self.report.positions)

    @property
    def open_positions(self) -> dict[str, Position]:
        """Final positions that are not flat (not part of ``trades`` yet)."""
        return {s: p for s, p in self.report.positions.items() if p.is_open}

    @property
    def instruments(self) -> dict[str, dict[str, Any]]:
        """Per-symbol engine metrics."""
        return dict(self.report.instruments)

    def monte_carlo(
        self,
        n: int = 1000,
        method: str = "shuffle",
        *,
        block: int | None = None,
        ruin: float = 0.5,
        seed: int | None = None,
        keep_paths: bool = False,
    ) -> MonteCarloResult:
        """Monte Carlo over the net round-trip PnLs (see :mod:`honba.research.montecarlo`).

        ``method`` is ``shuffle`` (reorder), ``resample`` (bootstrap) or ``block`` (moving-block
        bootstrap of ``block`` trades); ``ruin`` the loss fraction of ``config.capital`` that
        counts as ruin. Returns drawdown / return / ruin distributions and percentiles.
        """
        return monte_carlo_trades(
            [t.pnl for t in self.round_trips],
            self.config.capital,
            n=n,
            method=method,  # type: ignore[arg-type]
            block=block,
            ruin=ruin,
            seed=seed,
            keep_paths=keep_paths,
        )

    def metric(self, name: str, default: Any = None) -> Any:
        """One value by name: SDK :attr:`metrics` first, then the engine summary."""
        if hasattr(self.metrics, name):
            return getattr(self.metrics, name)
        return self.summary.get(name, default)

    def __repr__(self) -> str:
        s = self.report.summary
        return (
            f"BacktestResult({self.strategy or 'strategy'}, engine={self.engine!r}, "
            f"net_pnl={s.net_pnl:.2f}, trades={len(self.round_trips)}, "
            f"max_drawdown={self.metrics.max_drawdown:.2%})"
        )


def _frame(rows: list[dict[str, Any]], time_col: str) -> pd.DataFrame:
    frame = pd.DataFrame(rows)
    if frame.empty:
        return frame
    frame.insert(0, "time", _time_index(frame.pop(time_col)))
    return frame


def _fill_row(f: Fill) -> dict[str, Any]:
    row: dict[str, Any] = {
        "time_ms": f.time_ms,
        "order_id": f.order_id,
        "fill_id": f.fill_id,
        "symbol": f.symbol,
        "side": f.side,
        "qty": f.qty,
        "price": f.price,
        "value": f.value,
        "fees": f.costs.total,
    }
    row.update({k: getattr(f.costs, k) for k in _COST_FIELDS})
    row.update(realised_pnl=f.realised_pnl, product=f.product, tag=f.tag, reason=f.reason)
    return row


def _order_row(o: Order) -> dict[str, Any]:
    return {
        "id": o.id,
        "symbol": o.symbol,
        "side": o.side,
        "kind": o.kind,
        "qty": o.qty,
        "filled_qty": o.filled_qty,
        "avg_fill_price": o.avg_fill_price,
        "price": o.price,
        "trigger": o.trigger,
        "tif": o.tif,
        "product": o.product,
        "tag": o.tag,
        "role": o.role,
        "parent": o.parent,
        "status": o.status,
        "reason": o.reason,
        "stop_loss": o.stop_loss,
        "take_profit": o.take_profit,
        "trail": None if o.trail is None else f"{o.trail.mode}:{o.trail.value}",
        "trail_stop": o.trail_stop,
        "created": pd.Timestamp(o.created_ms, unit="ms", tz="UTC").tz_convert(IST),
        "updated": pd.Timestamp(o.updated_ms, unit="ms", tz="UTC").tz_convert(IST),
    }


def _reject_row(r: Reject) -> dict[str, Any]:
    return {
        "time_ms": r.time_ms,
        "id": r.id,
        "symbol": r.symbol,
        "side": r.side,
        "qty": r.qty,
        "reason": r.reason,
    }
