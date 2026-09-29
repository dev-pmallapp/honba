"""The engine abstraction: the same strategy on two engines, capability checks, the registry."""
# ruff: noqa: D101, D102, D103

from __future__ import annotations

import pytest
from honba.research.engine import (
    BacktestReport,
    BacktestRequest,
    ReportSummary,
    get_engine,
    register_engine,
)
from honba.research.simple_engine import SimpleEngine
from honba.strategy.types import Fill
from sdk_helpers import SmaCross, daily, flat, trending

import honba as hb
from honba.research import engine as engine_mod

CFG = hb.BacktestConfig(capital=100_000.0)


def test_same_strategy_same_result_on_barter_and_simple_engines():
    pytest.importorskip("honba._core")
    data = {"X": trending(160, seed=5)}
    barter = hb.backtest(SmaCross, data, CFG, engine="barter")
    simple = hb.backtest(SmaCross, data, CFG, engine="simple")
    assert (barter.engine, simple.engine) == ("barter", "simple")
    assert len(barter.round_trips) == len(simple.round_trips) > 0
    assert simple.summary["net_pnl"] == pytest.approx(barter.summary["net_pnl"])
    assert barter.fills[["side", "qty", "price"]].equals(simple.fills[["side", "qty", "price"]])
    assert barter.metrics.total_trades == simple.metrics.total_trades


def test_simple_engine_limit_orders_gap_and_day_expiry():
    class L(hb.Strategy):
        def on_bar(self, ctx):
            n = len(self.history())
            if n == 2:
                self.buy(10, limit=98, tif="gtc")
                self.buy(5, limit=50, tif="day")
            if n == 5:
                self.close()

    rows = [*flat(100, 2), (100, 101, 97, 99), (96, 97, 95, 96), (96, 96, 96, 96), (96, 96, 96, 96)]
    res = hb.backtest(L, {"X": daily(rows)}, CFG, engine="simple")
    assert res.fills.iloc[0][["price", "reason"]].tolist() == [98.0, "limit"]
    status = res.orders.set_index("id").status.to_dict()
    assert status["s2"] == "expired" and status["s1"] == "filled"
    assert res.round_trips[0].gross_pnl == pytest.approx(-20.0)


def test_simple_engine_cash_position_and_warmup_rules():
    class R(hb.Strategy):
        def on_bar(self, ctx):
            n = len(self.history())
            if n == 2:
                self.buy(10_000)  # unaffordable
                self.sell(1)  # no position, shorting off
                self.buy(1, id="dup")
                self.buy(1, id="dup")
            if ctx.warmup:
                self.buy(1)

    res = hb.backtest(
        R,
        {"X": daily(flat(100, 5))},
        hb.BacktestConfig(capital=1_000.0, warmup_bars=1),
        engine="simple",
    )
    assert sorted(res.rejected.reason) == [
        "duplicate_id",
        "insufficient_cash",
        "insufficient_position",
    ]


# ---------------------------------------------------------------------------- capabilities


class TrailStrategy(hb.Strategy):
    calls = 0

    def on_bar(self, ctx):
        TrailStrategy.calls += 1
        if len(self.history()) == 2:
            self.buy(1, stop=99, trail=hb.Trail.percent(2))


def test_trailing_on_simple_engine_fails_clearly_at_first_use():
    TrailStrategy.calls = 0
    with pytest.raises(hb.UnsupportedFeature) as info:
        hb.backtest(TrailStrategy, {"X": daily(flat(100, 4))}, CFG, engine="simple")
    assert info.value.engine == "simple"
    assert set(info.value.missing) == {"order:stop", "trail:percent"}
    assert TrailStrategy.calls == 2  # stopped at the first offending order


def test_declared_requires_fail_before_any_bar_runs():
    class Declared(TrailStrategy):
        requires = ("trail:atr", "bracket")

    TrailStrategy.calls = 0
    with pytest.raises(hb.UnsupportedFeature, match="bracket, trail:atr"):
        hb.backtest(Declared, {"X": daily(flat(100, 4))}, CFG, engine="simple")
    assert TrailStrategy.calls == 0


def test_config_features_are_checked_before_running():
    data = {"X": daily(flat(100, 4))}
    cases = {
        "session": hb.BacktestConfig(session=hb.TradingSession(), validation="off"),
        "instruments": hb.BacktestConfig(instruments={"X": hb.Instrument(lot_size=75)}),
        "cost:india": hb.BacktestConfig(costs=hb.CostModel.india()),
        "fill:next_open": hb.BacktestConfig(fill="next_open"),
    }
    for feature, cfg in cases.items():
        with pytest.raises(hb.UnsupportedFeature) as info:
            hb.backtest(SmaCross, data, cfg, engine="simple")
        assert info.value.missing == [feature], feature

    # multi-symbol / warm-up are supported by the reference engine
    class Noop(hb.Strategy):
        def on_bar(self, ctx):
            pass

    two = {"X": daily(flat(100, 30)), "Y": daily(flat(90, 30))}
    hb.backtest(Noop, two, hb.BacktestConfig(warmup_bars=2), engine="simple")


def test_barter_supports_everything_the_neutral_layer_can_say():
    caps = get_engine("barter").capabilities()
    for feature in (
        "order:stop_limit",
        "tif:gtc",
        "product:MIS",
        "trail:atr",
        "bracket",
        "modify",
        "session",
        "instruments",
        "cost:india",
        "fill:next_open",
        "warmup",
    ):
        assert caps.supports(feature), feature
    tiny = SimpleEngine().capabilities()
    assert tiny.missing(["trail:percent", "bracket", "order:limit"]) == ["bracket", "trail:percent"]


# ---------------------------------------------------------------------------- registry


class ZeroEngine:
    """A third-party engine: never trades, reports flat equity."""

    name = "zero"

    def capabilities(self):
        return hb.EngineCapabilities(name="zero")

    def run(self, request: BacktestRequest, on_bar):
        n = 0
        for i in range(len(next(iter(request.candles.values())))):
            bars = {s: b[i] for s, b in request.candles.items()}
            t = next(iter(bars.values())).time_ms
            ctx = hb.BarContext(t, False, 1e5, 1e5, bars, {}, (), (), hb.strategy.SessionState())
            on_bar(ctx)
            n += 1
        cap = request.config.capital
        summary = ReportSummary(cap, cap, cap, 0.0, 0.0)
        fills = [Fill(1, "o", "f", "X", "buy", 1, 1.0)]
        return BacktestReport(
            summary, fills=fills, equity_curve=[(1, cap)], num_bars=n, engine="zero"
        )


def test_engine_instance_and_registered_name_and_lazy_string():
    data = {"X": daily(flat(100, 5))}
    by_instance = hb.backtest(SmaCross, data, CFG, engine=ZeroEngine())
    assert by_instance.engine == "zero" and by_instance.report.num_bars == 5
    register_engine("zero", ZeroEngine)
    try:
        assert "zero" in hb.available_engines()
        assert hb.backtest(SmaCross, data, CFG, engine="zero").engine == "zero"
        register_engine("lazy", "honba.research.simple_engine:SimpleEngine")
        assert hb.backtest(SmaCross, data, CFG, engine="lazy").engine == "simple"
    finally:
        engine_mod._registered.pop("zero", None)
        engine_mod._registered.pop("lazy", None)
    with pytest.raises(ValueError, match="unknown engine"):
        get_engine("nope")
    with pytest.raises(TypeError, match="BacktestEngine"):
        get_engine(object())  # type: ignore[arg-type]


def test_entry_point_group_discovers_third_party_engines(monkeypatch):
    class EP:
        name = "ep_zero"

        def load(self):
            return ZeroEngine

    monkeypatch.setattr(
        engine_mod, "entry_points", lambda group: [EP()] if group == "honba.engines" else []
    )
    assert "ep_zero" in hb.available_engines()
    result = hb.backtest(SmaCross, {"X": daily(flat(100, 5))}, CFG, engine="ep_zero")
    assert result.engine == "zero"


def test_result_works_for_any_engine_report():
    res = hb.backtest(SmaCross, {"X": daily(flat(100, 5))}, CFG, engine=ZeroEngine())
    assert res.summary["net_pnl"] == 0.0 and res.raw is None
    assert list(res.fills.symbol) == ["X"] and res.trades.empty and res.orders.empty
    assert res.metrics.total_trades == 0


# ------------------------------------------------------------------------------- metrics authority


class GrossReportEngine(ZeroEngine):
    """Reports gross per-fill win_rate / profit_factor that must not leak into the result."""

    def run(self, request, on_bar):
        rep = super().run(request, on_bar)
        fills = [
            Fill(1, "a", "f1", "X", "buy", 1, 100.0),
            Fill(
                2,
                "b",
                "f2",
                "X",
                "sell",
                1,
                101.0,
                realised_pnl=1.0,
                costs=hb.strategy.Costs(total=3.0),
            ),
        ]
        rep.fills = fills
        rep.equity_curve = [(1, 100_000.0), (86_400_000 * 2, 99_998.0)]
        rep.summary.win_rate, rep.summary.profit_factor, rep.summary.sharpe = 1.0, 9.9, 9.9
        return rep


def test_sdk_net_metrics_override_gross_engine_values_everywhere():
    data = {"X": daily(flat(100, 4))}
    res = hb.backtest(SmaCross, data, CFG, engine=GrossReportEngine())
    assert res.report.summary.win_rate == 1.0  # engine value kept in the raw report ...
    assert res.summary["engine_win_rate"] == 1.0 and res.summary["engine_profit_factor"] == 9.9
    assert res.summary["win_rate"] == 0.0  # ... but the round trip is a net loser (1 - 3)
    assert res.metric("win_rate") == 0.0 and res.metric("profit_factor") == 0.0
    assert res.summary["sharpe"] != 9.9 and res.summary["sharpe"] == res.metrics.sharpe
    frame = hb.sweep(SmaCross, data, {"fast": [3, 4]}, CFG, engine=GrossReportEngine())
    assert (frame.win_rate == 0.0).all() and (frame.profit_factor == 0.0).all()


def test_annualisation_is_configurable_and_passed_to_the_engine():
    from honba.research._barter_adapter import config_to_wire

    data = {"X": trending(120, seed=4)}
    r250 = hb.backtest(SmaCross, data, CFG, engine="simple")
    r365 = hb.backtest(SmaCross, data, CFG.with_(trading_days_per_year=365), engine="simple")
    if r250.metrics.sharpe is not None and r250.metrics.sharpe != 0:
        assert r365.metrics.sharpe / r250.metrics.sharpe == pytest.approx((365 / 250) ** 0.5)
    assert config_to_wire(CFG, ["X"], None)["trading_days_per_year"] == 250
    assert (
        config_to_wire(CFG.with_(trading_days_per_year=252), ["X"], None)["trading_days_per_year"]
        == 252
    )
    with pytest.raises(ValueError):
        hb.BacktestConfig(trading_days_per_year=0)


# ---------------------------------------- contract / liquidation


def _core_module():
    pytest.importorskip("honba._core")
    from honba import _core

    return _core


def test_missing_contract_version_is_tolerated_and_mismatch_is_a_clear_error(monkeypatch):
    from honba.research import _barter_adapter as adapter

    core = _core_module()
    monkeypatch.delattr(core, "contract_version", raising=False)
    caps = adapter.BarterEngine().capabilities()  # older build: accepted
    assert not caps.supports("liquidate_at_end") and caps.supports("order:stop")
    assert adapter.core_contract(core) == 0
    res = hb.backtest(SmaCross, {"X": trending(60)}, CFG, engine="barter")
    assert res.engine == "barter"

    monkeypatch.setattr(core, "contract_version", lambda: adapter.CONTRACT_MAX + 1, raising=False)
    with pytest.raises(RuntimeError, match=r"engine contract \d+.*rebuild"):
        adapter.BarterEngine().capabilities()
    with pytest.raises(RuntimeError, match="rebuild"):
        hb.backtest(SmaCross, {"X": trending(60)}, CFG, engine="barter")


class BuyOnce(hb.Strategy):
    def on_bar(self, ctx):
        if len(self.history()) == 3 and self.position.is_flat:
            self.buy(10)


def test_liquidate_at_end_sdk_fallback_realises_the_round_trip_with_close_fills(monkeypatch):
    data = {"X": daily([(100, 101, 99, 100)] * 4 + [(100, 111, 99, 110)])}
    cfg = hb.BacktestConfig(capital=100_000.0, liquidate_at_end=True)
    simple = hb.backtest(BuyOnce, data, cfg, engine="simple")  # SDK-side close_all
    assert simple.positions["X"].is_flat and simple.round_trips[0].exit_tag == "liquidate_end"
    core = _core_module()
    monkeypatch.delattr(core, "contract_version", raising=False)  # older build: SDK fallback
    old = hb.backtest(BuyOnce, data, cfg, engine="barter")
    assert old.positions["X"].is_flat and old.round_trips[0].exit_tag == "liquidate_end"
    assert old.summary["net_pnl"] == pytest.approx(old.round_trips[0].pnl)


@pytest.mark.parametrize("fill", ["close", "next_open"])
def test_native_liquidate_at_end_realises_the_round_trip(fill):
    _core_module()
    data = {"X": daily([(100, 101, 99, 100)] * 4 + [(100, 111, 99, 110)])}
    cfg = hb.BacktestConfig(capital=100_000.0, fill=fill, liquidate_at_end=True)
    res = hb.backtest(BuyOnce, data, cfg, engine="barter")
    assert res.positions["X"].is_flat and len(res.round_trips) == 1
    trip = res.round_trips[0]
    assert trip.exit_reason == "liquidate_end" and trip.exit_price == pytest.approx(110.0)
    assert trip.gross_pnl == pytest.approx(100.0)
    assert res.fills.iloc[-1].reason == hb.FillReason.LIQUIDATE_END
    assert res.summary["net_pnl"] == pytest.approx(trip.pnl)
    assert (res.report.contract_version or 0) >= 2


def test_liquidate_at_end_with_next_open_needs_an_engine_that_supports_it(monkeypatch):
    data = {"X": daily(flat(100, 6))}
    cfg = hb.BacktestConfig(fill="next_open", liquidate_at_end=True)
    with pytest.raises(hb.UnsupportedFeature, match="liquidate_at_end"):
        hb.backtest(BuyOnce, data, cfg, engine=_NextOpenSimple())
    core = _core_module()
    monkeypatch.delattr(core, "contract_version", raising=False)
    with pytest.raises(hb.UnsupportedFeature, match="liquidate_at_end"):
        hb.backtest(BuyOnce, data, cfg, engine="barter")  # older build: no native support


class _NextOpenSimple(SimpleEngine):
    """Pretends to support next_open (it fills at the close) to hit the SDK refusal."""

    def capabilities(self):
        from dataclasses import replace

        return replace(super().capabilities(), fill_models=frozenset({"close", "next_open"}))


def test_liquidate_at_end_is_passed_to_engines_that_declare_it_and_sdk_stays_out():
    seen = {}

    class Native(ZeroEngine):
        def capabilities(self):
            return hb.EngineCapabilities(name="native", liquidate_at_end=True)

        def run(self, request, on_bar):
            seen["actions"] = []
            rep = super().run(request, lambda ctx: seen["actions"].extend(on_bar(ctx)) or [])
            seen["cfg"] = request.config.liquidate_at_end
            return rep

    hb.backtest(
        BuyOnce,
        {"X": daily(flat(100, 6))},
        hb.BacktestConfig(liquidate_at_end=True),
        engine=Native(),
    )
    assert seen["cfg"] is True
    assert [type(a).__name__ for a in seen["actions"]] == ["PlaceOrder"]  # no SDK-side close_all


# ------------------------------------------------------------ margin, same-bar exits, round trips


def test_margin_and_attached_exit_config_reach_the_engine_and_are_capability_checked():
    from honba.research._barter_adapter import config_to_wire

    wire = config_to_wire(CFG, ["X"], None)
    assert "margin" not in wire and "attached_exit_same_bar" not in wire  # defaults omitted
    cfg = CFG.with_(
        margin=hb.MarginConfig(mis_leverage=5, nrml_margin_pct=15, short_margin_pct=30),
        attached_exit_same_bar=True,
    )
    wire = config_to_wire(cfg, ["X"], None)
    assert wire["margin"] == {
        "mis_leverage": 5.0,
        "nrml_margin_pct": 15.0,
        "short_margin_pct": 30.0,
    }
    assert wire["attached_exit_same_bar"] is True
    with pytest.raises(hb.UnsupportedFeature) as info:
        hb.backtest(SmaCross, {"X": daily(flat(100, 30))}, cfg, engine="simple")
    assert info.value.missing == ["attached_exit_same_bar", "margin"]
    with pytest.raises(ValueError):
        hb.MarginConfig(mis_leverage=0.5)


def test_leverage_and_same_bar_exit_behave_on_the_real_engine():
    _core_module()
    assert get_engine("barter").capabilities().supports("margin")

    class Big(hb.Strategy):
        def on_bar(self, ctx):
            if len(self.history()) == 2:
                self.buy(30, product=hb.MIS, tag="big")  # 3000 notional vs 1000 capital

    data = {"X": daily(flat(100, 4))}
    plain = hb.backtest(Big, data, hb.BacktestConfig(capital=1_000.0))
    assert plain.rejected.reason.tolist() == [hb.RejectReason.INSUFFICIENT_CASH] or (
        plain.rejected.reason.tolist() == [hb.RejectReason.INSUFFICIENT_MARGIN]
    )
    levered = hb.backtest(
        Big, data, hb.BacktestConfig(capital=1_000.0, margin=hb.MarginConfig(mis_leverage=5))
    )
    assert levered.rejected.empty and levered.fills.qty.iloc[0] == 30

    class Bracket(hb.Strategy):
        def on_bar(self, ctx):
            if len(self.history()) == 2:
                self.buy(1, stop_loss=95)

    rows = [*flat(100, 2), (100, 101, 90, 92), (92, 92, 92, 92)]  # entry bar also trades 90
    later = hb.backtest(Bracket, {"X": daily(rows)}, CFG)
    same = hb.backtest(Bracket, {"X": daily(rows)}, CFG.with_(attached_exit_same_bar=True))
    assert len(later.fills) <= len(same.fills)


def test_reject_reasons_are_typed_and_delivered_to_on_reject():
    _core_module()
    got = []

    class R(hb.Strategy):
        def on_reject(self, reject):
            got.append(reject.reason)

        def on_bar(self, ctx):
            n = len(self.history())
            if n == 2:
                self.buy(10_000_000)  # far beyond cash
            if n == 3:
                self.sell(5)  # no position, shorting off

    hb.backtest(R, {"X": daily(flat(100, 5))}, CFG)
    assert got == [hb.RejectReason.INSUFFICIENT_CASH, hb.RejectReason.INSUFFICIENT_POSITION]
    assert isinstance(got[0], hb.RejectReason) and got[0] == "insufficient_cash"
    unknown = hb.strategy.Reject(1, None, "X", None, 0.0, "exchange: boom")
    assert unknown.reason == "exchange: boom" and not isinstance(unknown.reason, hb.RejectReason)
    assert {r.value for r in hb.RejectReason} >= {"no_bar", "no_position", "insufficient_margin"}


def test_engine_round_trips_agree_with_sdk_rebuilt_ones():
    _core_module()
    from honba.strategy.roundtrip import round_trips_from_fills

    data = {"A": trending(200, seed=7), "B": trending(200, seed=8, drift=-0.05)}

    class Two(hb.Strategy):
        fast = hb.Param(5, low=2, high=20)

        def on_bar(self, ctx):
            for sym in self.symbols:
                close = self.history(sym).close
                if len(close) < 21:
                    continue
                f, s_ = hb.ta.sma(close, 5, True), hb.ta.sma(close, 20, True)
                if self.positions[sym].is_flat and hb.ta.crossed_above(f, s_):
                    self.buy(10, sym, tag="up")
                elif self.positions[sym].is_long and hb.ta.crossed_below(f, s_):
                    self.close(sym, tag="down")

    cfg = hb.BacktestConfig(capital=1e6, costs=hb.CostModel.india(), liquidate_at_end=True)
    res = hb.backtest(Two, data, cfg)
    engine_trips = res.report.round_trips
    assert engine_trips and res.report.summary.num_round_trips == len(engine_trips)
    rebuilt = round_trips_from_fills(res.report.fills)
    key = lambda t: (t.exit_time_ms, t.symbol)  # noqa: E731
    assert len(rebuilt) == len(engine_trips)
    for mine, theirs in zip(sorted(rebuilt, key=key), sorted(engine_trips, key=key), strict=True):
        assert (mine.symbol, mine.side, mine.entry_time_ms, mine.exit_time_ms) == (
            theirs.symbol, theirs.side, theirs.entry_time_ms, theirs.exit_time_ms
        )  # fmt: skip
        for f in ("qty", "entry_price", "exit_price", "gross_pnl", "costs", "pnl", "return_pct"):
            assert getattr(mine, f) == pytest.approx(getattr(theirs, f)), f
    # the result exposes the engine's trips, enriched with tags / reasons from the fills
    assert [t.symbol for t in res.round_trips] == [t.symbol for t in engine_trips]
    assert {t.entry_tag for t in res.round_trips} <= {"up", None}
    assert any(t.exit_reason for t in res.round_trips)
    assert res.summary["win_rate"] == res.metrics.win_rate
    assert res.summary["engine_win_rate"] == pytest.approx(res.metrics.win_rate)  # net now
