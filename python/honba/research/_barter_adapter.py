"""The barter-rs engine: translates SDK types to and from the ``honba._core`` JSON contract.

This is the only module in ``honba`` allowed to touch the compiled engine (``honba._core``,
imported as ``from honba import _core``; enforced by import-linter and
``tests/test_engine_boundary.py``). The contract itself is documented in
``crates/honba-barter/src/lib.rs`` and ``report.rs``.
"""

from __future__ import annotations

import json
from dataclasses import replace
from typing import Any

from honba.strategy.actions import (
    Action,
    CancelAll,
    CancelOrder,
    ModifyOrder,
    PlaceOrder,
)
from honba.strategy.capabilities import EngineCapabilities
from honba.strategy.market import Instrument, TradingSession
from honba.strategy.types import (
    Bar,
    BarContext,
    Cancel,
    Costs,
    Fill,
    Order,
    Position,
    Reject,
    RoundTrip,
    SessionState,
    Trail,
    TrailUpdate,
)

from .config import BacktestConfig, MarginConfig
from .engine import BacktestReport, BacktestRequest, BarHandler, ReportSummary

__all__ = ["BarterEngine"]

_CAPABILITIES = EngineCapabilities(
    name="barter",
    order_kinds=frozenset({"market", "limit", "stop", "stop_limit"}),
    tifs=frozenset({"day", "ioc", "gtc"}),
    products=frozenset({"CNC", "MIS", "NRML", "MTF"}),
    trail_modes=frozenset({"percent", "amount", "atr"}),
    brackets=True,
    modify=True,
    cancel=True,
    multi_symbol=True,
    sessions=True,
    instruments=True,
    cost_models=frozenset({"flat", "india"}),
    fill_models=frozenset({"close", "next_open"}),
    warmup=True,
)


# ``_core.contract_version()`` (2: margin, liquidate_at_end, attached_exit_same_bar, engine
# round trips) lets the
# SDK detect a stale or too-new build. Builds without the function are accepted (older engine,
# contract 0) but lack the features listed in ``_FEATURE_MIN_CONTRACT``.
CONTRACT_MIN = 0
CONTRACT_MAX = 2
_FEATURE_MIN_CONTRACT = {"liquidate_at_end": 2, "margin": 2, "attached_exit_same_bar": 2}


def core_contract(core: Any) -> int:
    """The engine's contract version; 0 for builds that predate ``contract_version()``.

    Raises ``RuntimeError`` when the build is outside the range this SDK speaks.
    """
    fn = getattr(core, "contract_version", None)
    version = 0 if fn is None else int(fn())
    if not CONTRACT_MIN <= version <= CONTRACT_MAX:
        raise RuntimeError(
            f"honba._core speaks engine contract {version}, this SDK supports "
            f"{CONTRACT_MIN}..{CONTRACT_MAX}: rebuild with `maturin develop` "
            "(or upgrade honba)"
        )
    return version


def _load_core() -> Any:
    try:
        from honba import _core
    except ImportError as exc:  # pragma: no cover - depends on the build
        raise RuntimeError(
            "honba._core is not built; run `maturin develop` to compile the barter engine"
        ) from exc
    return _core


# -- SDK -> wire -----------------------------------------------------------------------------


def _trail_wire(trail: Trail) -> dict[str, Any]:
    out: dict[str, Any] = {"mode": trail.mode, "value": float(trail.value)}
    if trail.atr_period is not None:
        out["atr_period"] = int(trail.atr_period)
    if trail.activation is not None:
        out["activation_price"] = float(trail.activation)
    if trail.step is not None:
        out["step"] = float(trail.step)
    return out


def _instrument_wire(inst: Instrument) -> dict[str, Any]:
    out: dict[str, Any] = {"segment": inst.segment, "lot_size": inst.lot_size}
    for key in ("tick_size", "freeze_qty", "default_product"):
        if getattr(inst, key) is not None:
            out[key] = getattr(inst, key)
    return out


def _session_wire(session: TradingSession) -> dict[str, Any]:
    out: dict[str, Any] = {
        "tz": "Asia/Kolkata",
        "open": session.open,
        "close": session.close,
        "holidays": sorted(d.isoformat() for d in session.holidays),
        "trade_weekends": session.trade_weekends,
    }
    if session.mis_square_off:
        out["mis_square_off"] = session.mis_square_off
    return out


def config_to_wire(config: BacktestConfig, symbols: list[str], start_ms: int | None) -> dict:
    """The ``config_json`` object of ``_core.run_backtest``."""
    wire: dict[str, Any] = {
        "symbols": symbols,
        "exchange": config.exchange,
        "quote": config.quote,
        "initial_cash": float(config.capital),
        "latency_ms": int(config.latency_ms),
        "risk_free_return": float(config.risk_free_return),
        "trading_days_per_year": int(config.trading_days_per_year),
        "allow_short": config.allow_short,
        "fill_model": config.fill,
        "intrabar_priority": config.intrabar,
    }
    costs = config.costs
    if costs.model == "flat":
        wire["fees_percent"] = float(costs.pct)
    else:
        wire["costs"] = {
            "model": "india",
            "brokerage": {
                "per_order": costs.per_order,
                "pct": costs.brokerage_pct,
                "cnc_free": costs.cnc_free,
                "dp_per_sell": costs.dp_per_sell,
            },
            **({"table": costs.table} if costs.table else {}),
        }
    if config.instruments:
        wire["instruments"] = {s: _instrument_wire(i) for s, i in config.instruments.items()}
    if config.session is not None:
        wire["session"] = _session_wire(config.session)
    if config.liquidate_at_end:
        wire["liquidate_at_end"] = True
    if config.attached_exit_same_bar:
        wire["attached_exit_same_bar"] = True
    if config.margin != MarginConfig():
        wire["margin"] = {
            "mis_leverage": float(config.margin.mis_leverage),
            "nrml_margin_pct": float(config.margin.nrml_margin_pct),
            "short_margin_pct": float(config.margin.short_margin_pct),
        }
    if start_ms is not None:
        wire["start_ms"] = int(start_ms)
    return wire


def action_to_wire(action: Action) -> dict[str, Any]:
    """One entry of the list returned to ``_core`` from ``on_bar``."""
    if isinstance(action, PlaceOrder):
        out: dict[str, Any] = {
            "op": "place",
            "id": action.id,
            "symbol": action.symbol,
            "side": action.side,
            "qty": float(action.qty),
            "kind": action.kind,
        }
        optional = {
            "price": action.price,
            "trigger": action.trigger,
            "tif": action.tif,
            "product": action.product,
            "tag": action.tag,
            "stop_loss": action.stop_loss,
            "take_profit": action.take_profit,
        }
        out.update({k: v for k, v in optional.items() if v is not None})
        if action.trail is not None:
            out["trail"] = _trail_wire(action.trail)
        if action.reduce_only:
            out["reduce_only"] = True
        return out
    if isinstance(action, ModifyOrder):
        out = {"op": "modify", "id": action.id}
        optional = {
            "qty": action.qty,
            "price": action.price,
            "trigger": action.trigger,
            "tif": action.tif,
            "stop_loss": action.stop_loss,
            "take_profit": action.take_profit,
            "tag": action.tag,
        }
        out.update({k: v for k, v in optional.items() if v is not None})
        if action.trail is not None:
            out["trail"] = _trail_wire(action.trail)
        return out
    if isinstance(action, CancelOrder):
        return {"op": "cancel", "id": action.id}
    if isinstance(action, CancelAll):
        return {"op": "cancel_all", **({"symbol": action.symbol} if action.symbol else {})}
    raise TypeError(f"unknown action {action!r}")


# -- wire -> SDK -----------------------------------------------------------------------------


def _bar(raw: dict[str, Any]) -> Bar:
    return Bar(
        int(raw["time_ms"]),
        float(raw["open"]),
        float(raw["high"]),
        float(raw["low"]),
        float(raw["close"]),
        float(raw.get("volume", 0.0)),
    )


def _costs(raw: dict[str, Any] | None) -> Costs:
    raw = raw or {}
    return Costs(**{k: float(raw.get(k, 0.0)) for k in Costs.__dataclass_fields__})


def _trail(raw: dict[str, Any] | None) -> Trail | None:
    if not raw:
        return None
    return Trail(
        raw["mode"],
        float(raw["value"]),
        raw.get("atr_period"),
        raw.get("activation_price"),
        raw.get("step"),
    )


def _position(raw: dict[str, Any] | float | None) -> Position:
    if raw is None:
        return Position()
    if not isinstance(raw, dict):
        return Position(qty=float(raw))
    return Position(
        float(raw.get("qty", 0.0)),
        float(raw.get("avg_price", 0.0)),
        raw.get("product"),
        float(raw.get("realised_pnl", 0.0)),
        float(raw.get("unrealised_pnl", 0.0)),
        float(raw.get("pnl", 0.0)),
    )


def _order(raw: dict[str, Any]) -> Order:
    fields = Order.__dataclass_fields__
    known = {k: raw[k] for k in fields if k in raw and k != "trail"}
    return Order(trail=_trail(raw.get("trail")), **known)


def _fill(raw: dict[str, Any]) -> Fill:
    qty, price = float(raw["qty"]), float(raw["price"])
    return Fill(
        int(raw["time_ms"]),
        str(raw.get("order_id", raw.get("id", ""))),
        str(raw.get("fill_id", "")),
        raw["symbol"],
        raw["side"],
        qty,
        price,
        float(raw.get("value", qty * price)),
        _costs(raw.get("costs")),
        float(raw.get("realised_pnl", 0.0)),
        raw.get("product"),
        raw.get("tag"),
        raw.get("reason", "signal"),
    )


def _reject(raw: dict[str, Any]) -> Reject:
    return Reject(
        int(raw["time_ms"]),
        raw.get("id"),
        raw.get("symbol", ""),
        raw.get("side"),
        float(raw.get("qty", 0.0)),
        str(raw.get("reason", "")),
    )


def _event(raw: dict[str, Any]) -> Any:
    kind = raw.get("type")
    if kind == "fill":
        return _fill(raw)
    if kind in ("cancel", "expire"):
        return Cancel(
            kind, int(raw["time_ms"]), raw["id"], raw["symbol"], str(raw.get("reason", ""))
        )
    if kind == "reject":
        return _reject(raw)
    if kind == "trail_update":
        return TrailUpdate(
            int(raw["time_ms"]), raw["id"], raw["symbol"], raw.get("old_stop"), raw["new_stop"]
        )
    return None


def ctx_from_wire(raw: dict[str, Any]) -> BarContext:
    """The ``ctx`` dict passed to ``on_bar`` as a :class:`BarContext`."""
    session = raw.get("session") or {}
    events = (_event(e) for e in raw.get("events") or ())
    return BarContext(
        int(raw["time_ms"]),
        bool(raw.get("warmup", False)),
        float(raw.get("cash", 0.0)),
        float(raw.get("equity", raw.get("cash", 0.0))),
        {s: _bar(c) for s, c in (raw.get("candles") or {}).items()},
        {s: _position(p) for s, p in (raw.get("positions") or {}).items()},
        tuple(_order(o) for o in raw.get("open_orders") or ()),
        tuple(e for e in events if e is not None),
        SessionState(
            bool(session.get("is_open", True)),
            str(session.get("date", "")),
            session.get("minutes_to_close"),
        ),
    )


def _round_trip(raw: dict[str, Any]) -> RoundTrip:
    return RoundTrip(
        symbol=raw["symbol"],
        side=raw["side"],
        qty=float(raw["qty"]),
        entry_time_ms=int(raw["entry_time_ms"]),
        exit_time_ms=int(raw["exit_time_ms"]),
        entry_price=float(raw["entry_price"]),
        exit_price=float(raw["exit_price"]),
        gross_pnl=float(raw["gross_pnl"]),
        costs=float(raw["costs"]),
        product=raw.get("product"),
    )


def report_from_wire(raw: dict[str, Any]) -> BacktestReport:
    """The report JSON as a :class:`BacktestReport` (``raw`` keeps the original)."""
    s = raw.get("summary") or {}
    summary = ReportSummary(
        initial_cash=float(s.get("initial_cash", 0.0)),
        final_cash=float(s.get("final_cash", 0.0)),
        final_equity=float(s.get("final_equity", 0.0)),
        net_pnl=float(s.get("net_pnl", 0.0)),
        total_return=float(s.get("total_return", 0.0)),
        realised_pnl=float(s.get("realised_pnl", 0.0)),
        total_fees=float(s.get("total_fees", 0.0)),
        costs=_costs(s.get("costs")),
        num_trades=int(s.get("num_trades", 0)),
        num_closing_trades=int(s.get("num_closing_trades", 0)),
        num_round_trips=s.get("num_round_trips"),
        num_orders=int(s.get("num_orders", 0)),
        num_rejected=int(s.get("num_rejected", 0)),
        max_drawdown=float(s.get("max_drawdown", 0.0)),
        cagr=s.get("cagr"),
        sharpe=s.get("sharpe"),
        sortino=s.get("sortino"),
        calmar=s.get("calmar"),
        win_rate=s.get("win_rate"),
        profit_factor=s.get("profit_factor"),
    )
    return BacktestReport(
        summary=summary,
        fills=[_fill(t) for t in raw.get("trades") or ()],
        orders=[_order(o) for o in raw.get("orders") or ()],
        rejected=[_reject(r) for r in raw.get("rejected") or ()],
        equity_curve=[(int(t), float(e)) for t, e in raw.get("equity_curve") or ()],
        round_trips=(
            [_round_trip(t) for t in raw["round_trips"]] if "round_trips" in raw else None
        ),
        contract_version=raw.get("contract_version"),
        positions={s_: _position(p) for s_, p in (raw.get("positions") or {}).items()},
        instruments=dict(raw.get("instruments") or {}),
        start_ms=raw.get("start_ms"),
        num_bars=int(raw.get("num_bars", 0)),
        warmup_bars=int(raw.get("warmup_bars", 0)),
        engine="barter",
        raw=raw,
    )


class BarterEngine:
    """Bar-by-bar backtests on barter-rs.

    Needs the compiled ``honba._core`` (build with ``maturin develop``). Full order model:
    market / limit / stop / stop-limit, brackets, native trailing stops, sessions, Indian costs.
    """

    name = "barter"

    def capabilities(self) -> EngineCapabilities:
        """Everything the neutral layer can express; newer-contract features when built in."""
        version = core_contract(_load_core())
        extra = {f for f, low in _FEATURE_MIN_CONTRACT.items() if version >= low}
        return replace(
            _CAPABILITIES,
            liquidate_at_end="liquidate_at_end" in extra,
            extra=frozenset(extra - {"liquidate_at_end"}),
        )

    def run(self, request: BacktestRequest, on_bar: BarHandler) -> BacktestReport:
        """Run the backtest on the compiled engine."""
        _core = _load_core()
        core_contract(_core)
        symbols = list(request.candles)
        config = config_to_wire(request.config, symbols, request.start_ms)
        candles = {
            sym: list(
                zip(
                    bars.time_ms.tolist(),
                    bars.open.tolist(),
                    bars.high.tolist(),
                    bars.low.tolist(),
                    bars.close.tolist(),
                    bars.volume.tolist(),
                    strict=True,
                )
            )
            for sym, bars in request.candles.items()
        }

        def handler(ctx: dict[str, Any]) -> list[dict[str, Any]]:
            return [action_to_wire(a) for a in on_bar(ctx_from_wire(ctx))]

        raw = _core.run_backtest(json.dumps(config), candles, handler)
        return report_from_wire(json.loads(raw) if isinstance(raw, (str, bytes)) else dict(raw))
