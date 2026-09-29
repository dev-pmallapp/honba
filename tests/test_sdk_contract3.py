"""Engine contract 3 features through the SDK against the REAL barter engine."""
# ruff: noqa: D101, D102, D103

from __future__ import annotations

import pytest
from sdk_helpers import daily, flat

import honba as hb

pytest.importorskip("honba._core", reason="build the engine first: maturin develop")

CFG = hb.BacktestConfig(capital=1_000_000.0)


class Recorder(hb.Strategy):
    def on_start(self):
        self.fills, self.rejects, self.cancels, self.stops, self.seen = [], [], [], [], []

    def on_fill(self, fill):
        self.fills.append(fill)

    def on_reject(self, reject):
        self.rejects.append(reject)

    def on_cancel(self, cancel):
        self.cancels.append(cancel)


def run(strategy, rows, config=CFG, **kw):
    return hb.backtest(strategy, {"X": daily(rows)}, config, **kw)


def simple_caps_missing(config, strategy, *names):
    with pytest.raises(hb.UnsupportedFeature) as err:
        hb.backtest(strategy, {"X": daily(flat(100, 4))}, config, engine="simple")
    for name in names:
        assert name in err.value.missing


# ------------------------------------------------------------------------------- slippage


class BuyOnBar3(Recorder):
    qty = 10
    tif = None

    def on_bar(self, ctx):
        for o in self.orders():
            self.seen.append((ctx.time_ms, o.status, o.filled_qty))
        if len(self.history()) == 3 and self.position.is_flat:
            self.buy(self.qty, tif=self.tif)


def test_slippage_bps_moves_the_market_fill_against_the_order():
    cfg = CFG.with_(slippage=hb.Slippage.bps(50))
    res = run(BuyOnBar3, flat(100, 5), cfg)
    assert res.fills.price.tolist() == [pytest.approx(100.5)]
    plain = run(BuyOnBar3, flat(100, 5))
    assert plain.fills.price.tolist() == [100.0]


class BigGtc(BuyOnBar3):
    qty = 250
    tif = "gtc"  # a DAY remainder would expire with the (daily) bar's session


def test_slippage_volume_cap_leaves_a_working_remainder_and_partial_fills():
    cfg = CFG.with_(slippage=hb.Slippage.volume_share(0.0, 0.0, max_volume_share=0.1))
    res = hb.backtest(BigGtc, {"X": daily(flat(100, 8))}, cfg)  # volume 1000 / bar -> 100 / bar
    assert res.fills.qty.tolist() == [100.0, 100.0, 50.0]
    assert res.fills.reason.tolist() == ["signal"] * 3
    assert res.positions["X"].qty == 250.0
    assert {o.id: o.status for o in res.report.orders}["s1"] == "filled"


def test_partially_filled_status_is_visible_and_on_fill_fires_per_piece():
    cfg = CFG.with_(slippage=hb.Slippage.volume_share(max_volume_share=0.1))
    strat = {}

    class Probe(BigGtc):
        def on_start(self):
            super().on_start()
            strat["s"] = self

    res = hb.backtest(Probe, {"X": daily(flat(100, 8))}, cfg)
    me = strat["s"]
    assert [(f.qty, f.is_partial) for f in me.fills] == [
        (100.0, True),
        (100.0, True),
        (50.0, False),
    ]
    assert {status for _, status, _ in me.seen} == {"partially_filled"}
    assert [f.remaining_qty for f in me.fills] == [150.0, 50.0, 0.0]
    assert [filled for _, _, filled in me.seen] == sorted(filled for _, _, filled in me.seen)
    assert len(res.fills) == 3


def test_ioc_remainder_expires_and_handle_is_not_marked_filled():
    cfg = CFG.with_(slippage=hb.Slippage.volume_share(max_volume_share=0.1))
    res = hb.backtest(_Ioc, {"X": daily(flat(100, 6))}, cfg)
    assert [f.qty for f in res.report.fills] == [100.0]
    assert {o.id: o.status for o in res.report.orders}["s1"] == "expired"


class _Ioc(BigGtc):
    tif = "ioc"


def test_slippage_is_a_capability_and_simple_engine_names_it():
    simple_caps_missing(CFG.with_(slippage=hb.Slippage.bps(5)), BuyOnBar3, "slippage")
    assert hb.research.get_engine("barter").capabilities().supports("slippage")


def test_slippage_validation():
    with pytest.raises(ValueError, match="max_volume_share"):
        hb.Slippage.volume_share(1.0, 1.0, 1.5)
    with pytest.raises(ValueError, match=">= 0"):
        hb.Slippage.bps(-1)
