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
