"""Engine contract 3 features through the SDK against the REAL barter engine."""
# ruff: noqa: D101, D102, D103

from __future__ import annotations

import pytest
from honba.strategy.actions import PlaceOrder
from honba.strategy.types import StopUpdate
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


# ----------------------------------------------------------------------------- partial exits


class ScaleOut(Recorder):
    move = True

    def on_bar(self, ctx):
        self.stops += [e for e in ctx.events if isinstance(e, StopUpdate)]
        if len(self.history()) == 3 and self.position.is_flat:
            self.entry = self.buy(
                10,
                stop_loss=95,
                take_profit=[hb.Leg(110, qty=5), {"price": 120}],
                move_sl_to_entry_after_first_tp=self.move,
            )

    def on_stop_update(self, update):
        self.seen.append(update)


SCALE_ROWS = [*flat(100, 3), (100, 111, 99, 108), (108, 109, 99.5, 100), flat(100, 1)[0]]


def test_tp1_takes_half_then_stop_moves_to_entry_and_covers_the_rest():
    res = run(ScaleOut, SCALE_ROWS)
    f = res.fills
    assert f.order_id.tolist() == ["s1", "s1:tp1", "s1:sl"]
    assert f.qty.tolist() == [10.0, 5.0, 5.0]
    assert f.price.tolist() == [100.0, 110.0, 100.0]  # the stop sits at the entry price now
    assert f.reason.tolist() == ["signal", "take_profit", "stop_loss"]
    assert res.positions["X"].is_flat
    (trip,) = res.round_trips
    assert trip.gross_pnl == pytest.approx(50.0) and trip.exit_reason == "stop_loss"
    statuses = {o.id: o.status for o in res.report.orders}
    assert statuses == {
        "s1": "filled",
        "s1:sl": "filled",
        "s1:tp1": "filled",
        "s1:tp2": "cancelled",
    }


def test_stop_update_event_reaches_events_and_the_hook():
    strat = {}

    class Probe(ScaleOut):
        def on_start(self):
            super().on_start()
            strat["s"] = self

    run(Probe, SCALE_ROWS)
    me = strat["s"]
    (update,) = me.stops
    assert isinstance(update, StopUpdate) and me.seen == [update]  # ctx.events and on_stop_update
    assert (update.id, update.old_stop, update.new_stop) == ("s1:sl", 95.0, 100.0)
    assert update.reason == "move_sl_to_entry"


def test_without_move_the_stop_stays_and_the_last_target_completes_the_exit():
    class Hold(ScaleOut):
        move = False

    rows = [*flat(100, 3), (100, 111, 99, 108), (108, 121, 107, 120)]
    res = run(Hold, rows)
    assert res.fills.reason.tolist() == ["signal", "take_profit", "take_profit"]
    assert res.fills.price.tolist() == [100.0, 110.0, 120.0]
    assert res.summary["net_pnl"] == pytest.approx(5 * 10 + 5 * 20)


def test_remaining_stop_covers_what_the_targets_leave_when_the_stop_hits_first():
    class Hold(ScaleOut):
        move = False

    rows = [*flat(100, 3), (100, 111, 99, 108), (108, 109, 90, 92)]
    res = run(Hold, rows)
    assert res.fills.qty.tolist() == [10.0, 5.0, 5.0]
    assert res.fills.reason.tolist() == ["signal", "take_profit", "stop_loss"]
    assert res.fills.price.iloc[-1] == 95.0  # stop of the 5 left, not of all 10


def test_stop_loss_legs_and_replacing_legs_cancels_them_as_replaced():
    strat = {}

    class Legs(Recorder):
        def on_start(self):
            super().on_start()
            strat["s"] = self

        def on_bar(self, ctx):
            n = len(self.history())
            if n == 3:
                self.h = self.buy(
                    10,
                    stop_loss=[hb.Leg(95, pct=50), hb.Leg(92)],
                    take_profit=[hb.Leg(110, qty=4), hb.Leg(120)],
                )
            if n == 4:
                self.modify(self.h, take_profit=[hb.Leg(115, qty=6), hb.Leg(125)])

    res = run(Legs, flat(100, 6))
    ids = {o.id: (o.status, o.reason) for o in res.report.orders}
    assert ids["s1:tp1"] == ("cancelled", hb.CancelReason.REPLACED)
    assert ids["s1:tp2"] == ("cancelled", hb.CancelReason.REPLACED)
    assert {"s1:tp3", "s1:tp4", "s1:sl1", "s1:sl2"} <= set(ids)
    replaced = [c.id for c in strat["s"].cancels if c.reason == hb.CancelReason.REPLACED]
    assert sorted(replaced) == ["s1:tp1", "s1:tp2"]
    live = {o.id: o for o in res.report.orders if o.status == "open"}
    assert live["s1:tp3"].qty == 6.0 and live["s1:sl1"].qty == 5.0  # pct=50 of 10


def test_sdk_validates_legs_before_sending():
    fut = {"X": hb.Instrument("equity_futures", lot_size=75.0)}

    class Bad(Recorder):
        legs: object = None

        def on_bar(self, ctx):
            self.buy(150, take_profit=self.legs, stop_loss=90)

    def go(**attrs):
        cls = type("B", (Bad,), attrs)
        return run(cls, flat(100, 3), CFG.with_(instruments=fut))

    with pytest.raises(ValueError, match="not a multiple of the lot size 75"):
        go(legs=[hb.Leg(110, qty=100), hb.Leg(120)])
    with pytest.raises(ValueError, match="legs cover 225 but the order is for 150"):
        go(legs=[hb.Leg(110, qty=75), hb.Leg(120, qty=150)])
    with pytest.raises(ValueError, match="at most one leg"):
        go(legs=[hb.Leg(110), hb.Leg(120)])
    with pytest.raises(ValueError, match="add up to more than 100"):
        go(legs=[hb.Leg(110, pct=60), hb.Leg(120, pct=60)])
    with pytest.raises(ValueError, match="not both"):
        hb.Leg(100, qty=1, pct=10)

    class Both(Recorder):
        def on_bar(self, ctx):
            self.buy(10, stop_loss=[hb.Leg(90, qty=5), hb.Leg(85)], trail=hb.Trail.percent(1))

    with pytest.raises(ValueError, match="unsupported_trail"):
        run(Both, flat(100, 3))


def test_engine_reject_unsupported_trail_is_surfaced_as_a_typed_reason():
    class Raw(Recorder):
        def on_bar(self, ctx):
            if len(self.history()) == 3:
                self._emit(
                    PlaceOrder(
                        "raw",
                        "X",
                        "buy",
                        10.0,
                        stop_loss=(hb.Leg(90, qty=5), hb.Leg(85)),
                        trail=hb.Trail.percent(1.0),
                    )
                )

    res = run(Raw, flat(100, 5))
    assert [(r.id, r.reason) for r in res.report.rejected] == [
        ("raw", hb.RejectReason.UNSUPPORTED_TRAIL)
    ]


def test_partial_exits_are_a_capability_and_simple_engine_names_it():
    class Simple(hb.Strategy):
        def on_bar(self, ctx):
            self.buy(10, take_profit=[hb.Leg(110, qty=5), hb.Leg(120)])

    with pytest.raises(hb.UnsupportedFeature) as err:
        hb.backtest(Simple, {"X": daily(flat(100, 4))}, CFG, engine="simple")
    assert "partial_exits" in err.value.missing
    assert hb.research.get_engine("barter").capabilities().supports("partial_exits")
