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


# ---------------------------------------------------------------------------- price bands


class BandProbe(Recorder):
    def on_bar(self, ctx):
        n = len(self.history())
        if n == 3:
            self.buy(10, limit=120.0, tif="gtc", id="far")  # +20% vs the 100 close, band is 5%
            self.buy(10, limit=103.0, tif="gtc", id="near")


def test_price_band_rejects_a_limit_outside_the_band_only():
    cfg = CFG.with_(instruments={"X": hb.Instrument(price_band_pct=5.0)})
    res = run(BandProbe, flat(100, 6), cfg)
    assert [(r.id, r.reason) for r in res.report.rejected] == [
        ("far", hb.RejectReason.OUTSIDE_PRICE_BAND)
    ]
    assert res.positions["X"].qty == 10.0  # the in-band limit was marketable and filled
    plain = run(BandProbe, flat(100, 6), CFG.with_(instruments={"X": hb.Instrument()}))
    assert not plain.report.rejected


def test_price_band_locked_bar_blocks_buys_until_the_band_opens():
    class Buy(Recorder):
        def on_bar(self, ctx):
            if len(self.history()) == 2:
                self.buy(10, tif="gtc")

    up_lock = (105, 105, 105, 105)  # +5% locked at the upper band of a 100 close
    rows = [*flat(100, 2), up_lock, up_lock, (105, 106, 104, 105)]
    cfg = CFG.with_(instruments={"X": hb.Instrument(price_band_pct=5.0)}, fill="next_open")
    banded = run(Buy, rows, cfg)
    free = run(Buy, rows, cfg.with_(instruments={"X": hb.Instrument()}))
    assert banded.fills.time.iloc[0] > free.fills.time.iloc[0]  # the locked bar filled nothing


def test_price_bands_are_a_capability_and_simple_engine_names_them():
    cfg = CFG.with_(instruments={"X": hb.Instrument(price_band_pct=10.0)})
    simple_caps_missing(cfg, BandProbe, "price_bands", "instruments")
    assert hb.research.get_engine("barter").capabilities().supports("price_bands")
    with pytest.raises(ValueError, match="price_band_pct"):
        hb.Instrument(price_band_pct=0)


# ------------------------------------------------------------------------------ freeze qty

FUT = {"X": hb.Instrument("equity_futures", lot_size=75.0, freeze_qty=150.0)}


class BuyLots(Recorder):
    qty = 450

    def on_bar(self, ctx):
        if len(self.history()) == 2 and self.position.is_flat:
            self.buy(self.qty, tag="big")


def test_freeze_policy_reject_is_the_default_and_split_executes_slices_with_own_costs():
    costs = hb.CostModel.india()
    rej = run(BuyLots, flat(1000, 4), CFG.with_(instruments=FUT, costs=costs))
    assert [r.reason for r in rej.report.rejected] == [hb.RejectReason.ABOVE_FREEZE_QTY]
    assert rej.fills.empty

    cfg = CFG.with_(instruments=FUT, costs=costs, freeze_policy="split")
    res = run(BuyLots, flat(1000, 4), cfg)
    assert not res.report.rejected
    assert res.fills.qty.tolist() == [150.0, 150.0, 150.0]
    assert res.fills.slice.tolist() == ["s1#1", "s1#2", "s1#3"]
    assert set(res.fills.order_id) == {"s1"}
    assert res.positions["X"].qty == 450.0
    assert res.fills.brokerage.tolist() == [pytest.approx(20.0)] * 3  # per-slice brokerage cap
    assert res.summary["total_fees"] == pytest.approx(res.fills.fees.sum())


def test_freeze_split_reaches_on_fill_as_neutral_slice_key():
    seen = {}

    class Probe(BuyLots):
        def on_start(self):
            super().on_start()
            seen["s"] = self

    run(Probe, flat(1000, 4), CFG.with_(instruments=FUT, freeze_policy="split"))
    assert [f.slice for f in seen["s"].fills] == ["s1#1", "s1#2", "s1#3"]
    assert all(isinstance(f, hb.Fill) for f in seen["s"].fills)


def test_split_order_helper_stays_the_fallback_for_engines_without_native_split():
    cfg = CFG.with_(instruments=FUT, freeze_policy="split")
    simple_caps_missing(cfg, BuyLots, "freeze_split")
    assert hb.split_order(450, 150, 75) == [150.0, 150.0, 150.0]

    class Manual(Recorder):
        def on_bar(self, ctx):
            if len(self.history()) == 2:
                for piece in hb.split_order(450, 150, 75):
                    self.buy(piece)

    res = run(Manual, flat(1000, 4), CFG.with_(instruments=FUT))
    assert res.fills.qty.tolist() == [150.0, 150.0, 150.0] and not res.report.rejected
    assert hb.research.get_engine("barter").capabilities().supports("freeze_split")
    with pytest.raises(ValueError, match="freeze_policy"):
        hb.BacktestConfig(freeze_policy="sometimes")  # type: ignore[arg-type]
