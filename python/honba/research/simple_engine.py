"""``SimpleEngine``: a tiny pure-Python reference engine.

Market and limit orders only (no stops, brackets, trailing, sessions, lot / tick rules, Indian
costs). It exists to prove the engine abstraction and to run strategies without the compiled
barter extension; it is also a compact example of what an engine has to implement.

Model: bars are replayed per timestamp; resting limit orders match against the bar's range
(gap-through fills at the open), market orders and immediately marketable limits fill at the
decision bar's close, ``day`` orders expire when the IST date changes.
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace

from honba.strategy.actions import CancelAll, CancelOrder, PlaceOrder
from honba.strategy.capabilities import EngineCapabilities
from honba.strategy.types import (
    Bar,
    BarContext,
    Cancel,
    Costs,
    Fill,
    Order,
    Position,
    Reject,
    SessionState,
)

from .engine import BacktestReport, BacktestRequest, BarHandler, ReportSummary

__all__ = ["SimpleEngine"]

_EPS = 1e-9


@dataclass(slots=True)
class _Pos:
    qty: float = 0.0
    avg: float = 0.0
    realised: float = 0.0


@dataclass(slots=True)
class _Live:
    order: Order
    day: int


@dataclass(slots=True)
class _State:
    cash: float
    fee_rate: float
    allow_short: bool
    pos: dict[str, _Pos] = field(default_factory=dict)
    last: dict[str, Bar] = field(default_factory=dict)
    live: dict[str, _Live] = field(default_factory=dict)
    seen: set[str] = field(default_factory=set)
    events: list = field(default_factory=list)
    fills: list[Fill] = field(default_factory=list)
    orders: dict[str, Order] = field(default_factory=dict)
    rejected: list[Reject] = field(default_factory=list)
    fill_seq: int = 0
    auto_id: int = 0

    def equity(self) -> float:
        return self.cash + sum(
            p.qty * self.last[s].close for s, p in self.pos.items() if s in self.last
        )


def _day(time_ms: int) -> int:
    return (time_ms + 19_800_000) // 86_400_000


class SimpleEngine:
    """Reference engine (market / limit, close fills). See the module docstring."""

    name = "simple"

    def capabilities(self) -> EngineCapabilities:
        """Market and limit orders, flat costs, close fills, warm-up."""
        return EngineCapabilities(
            name="simple",
            order_kinds=frozenset({"market", "limit"}),
            tifs=frozenset({"day", "ioc", "gtc"}),
            products=frozenset({"CNC"}),
            warmup=True,
        )

    # -- helpers -----------------------------------------------------------------------------

    @staticmethod
    def _reject(st: _State, t: int, action: PlaceOrder | None, reason: str, oid=None) -> None:
        ev = Reject(
            t,
            oid if oid is not None else (action.id if action else None),
            action.symbol if action else "",
            action.side if action else None,
            action.qty if action else 0.0,
            reason,
        )
        st.rejected.append(ev)
        st.events.append(ev)

    @staticmethod
    def _close_order(st: _State, oid: str, status: str, reason: str, t: int) -> None:
        live = st.live.pop(oid)
        closed = replace(live.order, status=status, reason=reason, updated_ms=t)
        st.orders[oid] = closed
        kind = "expire" if status == "expired" else "cancel"
        st.events.append(Cancel(kind, t, oid, closed.symbol, reason))  # type: ignore[arg-type]

    @staticmethod
    def _fill(st: _State, oid: str, price: float, t: int, reason: str) -> bool:
        live = st.live[oid]
        o = live.order
        sign = 1.0 if o.side == "buy" else -1.0
        pos = st.pos.setdefault(o.symbol, _Pos())
        value = o.qty * price
        fee = value * st.fee_rate
        if sign > 0 and value + fee > st.cash + _EPS:
            SimpleEngine._reject(st, t, None, "insufficient_cash", oid)
            del st.live[oid]
            st.orders[oid] = replace(o, status="rejected", reason="insufficient_cash", updated_ms=t)
            return False
        if sign < 0 and not st.allow_short and o.qty > pos.qty + _EPS:
            SimpleEngine._reject(st, t, None, "insufficient_position", oid)
            del st.live[oid]
            st.orders[oid] = replace(
                o, status="rejected", reason="insufficient_position", updated_ms=t
            )
            return False
        realised = 0.0
        signed = sign * o.qty
        if abs(pos.qty) > _EPS and pos.qty * signed < 0:
            closing = min(abs(pos.qty), o.qty)
            realised = (price - pos.avg) * closing * (1.0 if pos.qty > 0 else -1.0)
        new_qty = pos.qty + signed
        if abs(pos.qty) <= _EPS or pos.qty * signed > 0:
            total = abs(pos.qty) + o.qty
            pos.avg = (pos.avg * abs(pos.qty) + price * o.qty) / total
        elif abs(new_qty) > _EPS and new_qty * pos.qty < 0:
            pos.avg = price
        pos.qty = 0.0 if abs(new_qty) <= _EPS else new_qty
        if pos.qty == 0.0:
            pos.avg = 0.0
        pos.realised += realised
        st.cash -= sign * value + fee
        st.fill_seq += 1
        fill = Fill(
            t, oid, f"f{st.fill_seq}", o.symbol, o.side, o.qty, price, value,
            Costs(brokerage=fee, total=fee), realised, o.product or "CNC", o.tag, reason,
        )  # fmt: skip
        st.fills.append(fill)
        st.events.append(fill)
        del st.live[oid]
        st.orders[oid] = replace(
            o, status="filled", filled_qty=o.qty, avg_fill_price=price, updated_ms=t
        )
        return True

    def _place(self, st: _State, a: PlaceOrder, bar: Bar | None, t: int, warmup: bool) -> None:
        if warmup:
            return self._reject(st, t, a, "warmup")
        if a.id in st.seen:
            return self._reject(st, t, a, "duplicate_id")
        if a.symbol not in st.last:
            return self._reject(st, t, a, "unknown_symbol")
        if not a.qty > 0:
            return self._reject(st, t, a, "invalid_qty")
        if a.kind == "limit" and not (a.price and a.price > 0):
            return self._reject(st, t, a, "invalid_price")
        st.seen.add(a.id)
        order = Order(
            a.id, a.symbol, a.side, a.kind, a.qty, price=a.price, tif=a.tif or "day",
            product=a.product or "CNC", tag=a.tag, created_ms=t, updated_ms=t,
        )  # fmt: skip
        st.live[a.id] = _Live(order, _day(t))
        close = st.last[a.symbol].close
        marketable = a.kind == "market" or (
            a.price is not None and (close <= a.price if a.side == "buy" else close >= a.price)
        )
        if marketable:
            self._fill(st, a.id, close, t, "signal" if a.kind == "market" else "limit")
        elif order.tif == "ioc":
            self._close_order(st, a.id, "expired", "ioc", t)

    # -- run ---------------------------------------------------------------------------------

    def run(self, request: BacktestRequest, on_bar: BarHandler) -> BacktestReport:
        """Replay the candles and return the report."""
        cfg = request.config
        st = _State(cfg.capital, cfg.costs.pct / 100.0, cfg.allow_short)
        by_time: dict[int, dict[str, Bar]] = {}
        for sym, bars in request.candles.items():
            for i in range(len(bars)):
                bar = bars[i]
                by_time.setdefault(bar.time_ms, {})[sym] = bar  # type: ignore[assignment]
        equity: list[tuple[int, float]] = []
        n_warm = 0
        for t in sorted(by_time):
            new = by_time[t]
            warmup = request.start_ms is not None and t < request.start_ms
            n_warm += warmup
            # 1. resting orders against the new bars (orders from earlier bars only)
            for oid in list(st.live):
                live = st.live[oid]
                o = live.order
                bar = new.get(o.symbol)
                if bar is None:
                    continue
                if o.tif == "day" and _day(t) != live.day:
                    self._close_order(st, oid, "expired", "day", t)
                    continue
                if o.kind == "limit" and o.price is not None:
                    hit = (
                        (bar.open <= o.price and bar.open) or (bar.low <= o.price and o.price)
                        if o.side == "buy"
                        else (bar.open >= o.price and bar.open) or (bar.high >= o.price and o.price)
                    )
                    if hit:
                        self._fill(st, oid, float(hit), t, "limit")
            st.last.update(new)
            for sym in request.candles:
                st.pos.setdefault(sym, _Pos())
            # 2. decide
            ctx = BarContext(
                t,
                warmup,
                st.cash,
                st.equity(),
                dict(st.last),
                {
                    s: Position(
                        p.qty,
                        p.avg,
                        "CNC" if p.qty else None,
                        p.realised,
                        (st.last[s].close - p.avg) * p.qty if s in st.last else 0.0,
                        p.realised + ((st.last[s].close - p.avg) * p.qty if s in st.last else 0.0),
                    )
                    for s, p in st.pos.items()
                },
                tuple(l.order for l in st.live.values()),  # noqa: E741
                tuple(st.events),
                SessionState(True, ""),
            )
            st.events = []
            for a in on_bar(ctx):
                if isinstance(a, PlaceOrder):
                    self._place(st, a, new.get(a.symbol), t, warmup)
                elif isinstance(a, CancelOrder):
                    if a.id in st.live:
                        self._close_order(st, a.id, "cancelled", "user", t)
                    else:
                        self._reject(st, t, None, "unknown_order", a.id)
                elif isinstance(a, CancelAll):
                    for oid in [
                        i for i, lv in st.live.items() if a.symbol in (None, lv.order.symbol)
                    ]:
                        self._close_order(st, oid, "cancelled", "user", t)
            if not warmup:
                equity.append((t, st.equity()))
        return self._report(request, st, equity, n_warm, len(by_time))

    @staticmethod
    def _report(
        req: BacktestRequest, st: _State, curve: list[tuple[int, float]], warm: int, bars: int
    ) -> BacktestReport:
        cfg = req.config
        final = curve[-1][1] if curve else cfg.capital
        peak, mdd = cfg.capital, 0.0
        for _, e in curve:
            peak = max(peak, e)
            mdd = max(mdd, (peak - e) / peak)
        fees = sum(f.costs.total for f in st.fills)
        summary = ReportSummary(
            initial_cash=cfg.capital,
            final_cash=st.cash,
            final_equity=final,
            net_pnl=final - cfg.capital,
            total_return=(final - cfg.capital) / cfg.capital,
            realised_pnl=sum(f.realised_pnl for f in st.fills),
            total_fees=fees,
            costs=Costs(brokerage=fees, total=fees),
            num_trades=len(st.fills),
            num_orders=len(st.orders) + len(st.live),
            num_rejected=len(st.rejected),
            max_drawdown=mdd,
        )
        orders = list(st.orders.values()) + [lv.order for lv in st.live.values()]
        return BacktestReport(
            summary=summary,
            fills=st.fills,
            orders=sorted(orders, key=lambda o: o.created_ms),
            rejected=st.rejected,
            equity_curve=curve,
            positions={
                s: Position(p.qty, p.avg, "CNC" if p.qty else None, p.realised)
                for s, p in st.pos.items()
            },
            start_ms=req.start_ms,
            num_bars=bars,
            warmup_bars=warm,
            engine="simple",
        )
