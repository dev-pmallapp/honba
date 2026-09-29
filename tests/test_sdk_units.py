"""Pure-Python SDK unit tests (no engine): params, sizing, resampling, validation, metrics."""
# ruff: noqa: D101, D102, D103

from __future__ import annotations

import random
import warnings
from datetime import date

import numpy as np
import pandas as pd
import polars as pl
import pytest
from honba.research._data import to_candles
from honba.research.metrics import compute_metrics, daily_returns
from honba.research.validation import validate_candles
from honba.strategy import (
    Bar,
    BarBuffer,
    BarContext,
    Costs,
    Fill,
    Position,
    Resampler,
    RoundTripTracker,
    SessionState,
    StrategyRunner,
    round_trips_from_fills,
    sizing,
)
from honba.strategy.actions import CancelAll, CancelOrder, ModifyOrder
from sdk_helpers import daily, flat, intraday

import honba as hb

NSE = hb.TradingSession()
DAY0 = pd.Timestamp("2024-01-01 09:15", tz="Asia/Kolkata")  # a Monday


def ms(ts) -> int:
    return int(pd.Timestamp(ts).tz_convert("UTC").value // 1_000_000)


# ---------------------------------------------------------------------------- params


class P(hb.Strategy):
    fast = hb.Param(10, low=2, high=20, step=4)
    mult = hb.Param(1.5, low=1.0, high=3.0)
    mode = hb.Param("a", choices=("a", "b"))
    on = hb.Param(True)

    def on_bar(self, ctx): ...


def test_param_defaults_bounds_and_readonly():
    s = P()
    assert (s.fast, s.mult, s.mode, s.on) == (10, 1.5, "a", True)
    assert P(fast=6).fast == 6 and P.params().keys() == {"fast", "mult", "mode", "on"}
    with pytest.raises(ValueError, match="above high"):
        P(fast=21)
    with pytest.raises(ValueError, match="below low"):
        P(mult=0.5)
    with pytest.raises(ValueError, match="not in"):
        P(mode="c")
    with pytest.raises(TypeError, match="unknown parameters"):
        P(nope=1)
    with pytest.raises(ValueError, match="integer"):
        P(fast=2.5)
    with pytest.raises(AttributeError):
        s.fast = 3
    assert isinstance(P.fast, hb.Param)  # class access gives the declaration


def test_param_grid_and_sample_stay_in_bounds():
    assert P.fast.grid() == [2, 6, 10, 14, 18]
    assert P.mult.grid(3) == [1.0, 2.0, 3.0] and P.mode.grid() == ["a", "b"]
    assert P.on.grid() == [False, True]
    rng = random.Random(0)
    assert all(2 <= P.fast.sample(rng) <= 20 for _ in range(50))
    assert all(1.0 <= P.mult.sample(rng) <= 3.0 for _ in range(50))
    with pytest.raises(ValueError):
        hb.Param(1, low=5, high=2)


def test_params_are_inherited():
    class Child(P):
        extra = hb.Param(3, low=1, high=5)

        def on_bar(self, ctx): ...

    assert set(Child.params()) == {"fast", "mult", "mode", "on", "extra"}


# ---------------------------------------------------------------------------- instruments / sizing


def test_instrument_rounding():
    inst = hb.Instrument("equity_futures", lot_size=75, tick_size=0.05)
    assert inst.round_price(100.03) == 100.05 and inst.round_price(100.02) == 100.0
    assert inst.round_price(100.09, "down") == 100.05 and inst.round_price(100.01, "up") == 100.05
    assert inst.round_qty(160) == 150 and inst.round_qty(-160) == -150 and inst.round_qty(74) == 0
    assert hb.Instrument().round_price(1.2345) == 1.2345  # no tick: untouched
    with pytest.raises(ValueError):
        hb.Instrument("nope")


def test_sizing_functions():
    assert sizing.floor_to_lot(174, 75) == 150 and sizing.floor_to_lot(-5) == 0
    assert sizing.qty_by_risk(100_000, 0.01, entry=100, stop=98) == 500
    assert sizing.qty_by_risk(100_000, 0.01, entry=100, stop=98, lot_size=75) == 450
    assert sizing.qty_by_fraction(100_000, 0.1, 250, lot_size=1) == 40
    assert sizing.qty_by_atr(100_000, 0.01, atr=2, mult=2) == 250
    assert sizing.kelly_fraction(0.6, 1.0) == pytest.approx(0.2)
    assert sizing.kelly_fraction(0.3, 1.0) == 0.0 and sizing.kelly_fraction(
        0.6, 1, 0.5
    ) == pytest.approx(0.1)
    assert sizing.round_to_tick(100.07, 0.05) == 100.05
    with pytest.raises(ValueError):
        sizing.qty_by_risk(1, 0.01, 100, 100)


def _ctx(
    t=0,
    close=100.0,
    equity=100_000.0,
    cash=100_000.0,
    positions=None,
    orders=(),
    events=(),
    warmup=False,
    sym="X",
):
    return BarContext(
        t, warmup, cash, equity, {sym: Bar(t, close, close, close, close, 10)},
        positions or {sym: Position()}, tuple(orders), tuple(events), SessionState(),
    )  # fmt: skip


class Probe(hb.Strategy):
    """Runs a callback in on_bar so tests can poke the order API."""

    def on_bar(self, ctx):
        Probe.fn(self, ctx)


def act(fn, ctx=None, instruments=None, caps=None, symbols=("X",), **kw):
    Probe.fn = staticmethod(fn)
    runner = StrategyRunner(Probe, symbols, instruments=instruments, capabilities=caps, **kw)
    return runner(ctx or _ctx())


def test_sizer_uses_equity_lot_and_cash_cap():
    inst = {"X": hb.Instrument("equity_futures", lot_size=75)}
    out = {}

    def fn(s, ctx):
        out["risk"] = s.size.by_risk(0.01, entry=100, stop=98)  # 500 -> 450
        out["frac"] = s.size.by_fraction(0.10)  # 100 shares -> 75
        out["cap"] = s.size.by_risk(
            0.05, entry=100, stop=99, cap_cash=True
        )  # 5000 -> cash 1000/100
        out["atr"] = s.size.by_atr(0.01, atr=1.0, mult=2.0)
        out["value"] = s.size.by_value(3_000)

    act(fn, _ctx(cash=10_000.0), instruments=inst)
    assert out == {"risk": 450, "frac": 75, "cap": 75, "atr": 450, "value": 0}


# ---------------------------------------------------------------------------- order API mapping


def test_kind_inference_and_prices_rounded_to_tick_and_lot():
    inst = {"X": hb.Instrument(lot_size=10, tick_size=0.05)}

    def fn(s, ctx):
        s.buy(25)
        s.buy(25, limit=99.93, tif="gtc", tag="l")
        s.sell(25, stop=90.02)
        s.sell(25, stop=90.02, limit=89.97, product=hb.MIS)
        s.buy(25, stop_loss=95.03, take_profit=110.01, trail=hb.Trail.atr(2, 10, step=0.5))

    a = act(fn, instruments=inst)
    assert [x.kind for x in a] == ["market", "limit", "stop", "stop_limit", "market"]
    assert all(x.qty == 20 for x in a)
    assert (a[1].price, a[1].tif, a[1].tag) == (99.95, "gtc", "l")
    assert a[2].trigger == 90.0 and (a[3].trigger, a[3].price, a[3].product) == (90.0, 89.95, "MIS")
    assert (a[4].stop_loss, a[4].take_profit) == (95.05, 110.0)
    assert a[4].trail == hb.Trail("atr", 2, 10, None, 0.5)
    assert len({x.id for x in a}) == 5  # unique generated ids


def test_order_validation_errors():
    def bad(fn, exc, match):
        with pytest.raises(exc, match=match):
            act(fn)

    bad(lambda s, c: s.buy(0), ValueError, "positive")
    bad(lambda s, c: s.buy(1, kind="limit"), ValueError, "does not match")
    bad(lambda s, c: s.buy(1, trail=1.5), TypeError, "Trail")
    bad(lambda s, c: s.order("hold", 1), ValueError, "side")
    with pytest.raises(ValueError, match="symbol is required"):
        act(lambda s, c: s.buy(1), symbols=("A", "B"))
    with pytest.raises(ValueError, match="trail value"):
        hb.Trail.percent(0)


def test_below_one_lot_is_skipped_and_warmup_orders_are_dropped():
    inst = {"X": hb.Instrument(lot_size=75)}
    seen = {}

    def fn(s, ctx):
        seen["h"] = s.buy(50)
        seen["log"] = list(s._logs)

    assert (
        act(fn, instruments=inst) == []
        and seen["h"] is None
        and "below one lot" in seen["log"][0][1]
    )
    assert act(lambda s, c: s.buy(5), _ctx(warmup=True)) == []


def test_default_product_and_class_product():
    class Mis(Probe):
        product = hb.MIS

    Probe.fn = staticmethod(lambda s, c: s.buy(1))
    assert StrategyRunner(Mis, ["X"])(_ctx())[0].product == "MIS"


def test_target_nets_position_and_resting_orders_and_cancels_pending_entries():
    from honba.strategy.types import Order

    resting = Order("r1", "X", "buy", "limit", 10, price=90.0, status="open", role="entry")
    exit_leg = Order(
        "r1:sl", "X", "sell", "stop", 10, trigger=80.0, status="pending", role="stop_loss"
    )
    pos = {"X": Position(qty=30.0, avg_price=95.0, product="MIS")}

    def fn(s, ctx):
        s.target(qty=50)  # +20 vs the position; cancels resting entry r1 (not the exit leg)
        s.target(qty=50)  # queued +20 is netted: nothing more

    a = act(fn, _ctx(positions=pos, orders=[resting, exit_leg]))
    assert [type(x).__name__ for x in a] == ["CancelOrder", "PlaceOrder", "CancelOrder"]
    assert a[0].id == "r1" and (a[1].side, a[1].qty) == ("buy", 20.0)
    # reducing a position keeps the position's product, not the class default
    a = act(lambda s, c: s.target(qty=10), _ctx(positions=pos))
    assert (a[0].side, a[0].qty, a[0].product) == ("sell", 20.0, "MIS")
    a = act(lambda s, c: s.target(qty=-5), _ctx(positions=pos))  # flip short
    assert (a[0].side, a[0].qty) == ("sell", 35.0)
    a = act(lambda s, c: s.target(pct=0.1), _ctx(close=250.0))
    assert (a[0].side, a[0].qty) == ("buy", 40.0)
    assert act(lambda s, c: s.target(qty=30), _ctx(positions=pos)) == []
    with pytest.raises(ValueError, match="exactly one"):
        act(lambda s, c: s.target(qty=1, pct=0.1))


def test_close_all_cancels_everything_then_flattens_each_symbol():
    pos = {"A": Position(qty=5.0), "B": Position(qty=-3.0), "C": Position()}
    ctx = BarContext(
        0,
        False,
        1e5,
        1e5,
        {s: Bar(0, 10, 10, 10, 10, 1) for s in "ABC"},
        pos,
        (),
        (),
        SessionState(),
    )
    a = act(lambda s, c: s.close_all(tag="x"), ctx, symbols=("A", "B", "C"))
    assert isinstance(a[0], CancelAll) and a[0].symbol is None
    assert [(x.symbol, x.side, x.qty) for x in a[1:]] == [("A", "sell", 5.0), ("B", "buy", 3.0)]


def test_modify_cancel_handles():
    inst = {"X": hb.Instrument(tick_size=0.05)}
    out = {}

    def fn(s, ctx):
        h = s.buy(5, limit=90, stop_loss=80)
        out["status"] = h.status
        h.modify(limit=90.03, stop_loss=81.0)
        s.modify(h.stop_order, stop=85.01, qty=3)
        s.cancel(h.target_order)
        h.cancel()
        s.cancel_all("X")

    a = act(fn, instruments=inst)
    assert out["status"] == "submitted"
    assert a[1] == ModifyOrder(a[0].id, price=90.05, stop_loss=81.0)
    assert a[2] == ModifyOrder(f"{a[0].id}:sl", qty=3, trigger=85.0)
    assert a[3:] == [CancelOrder(f"{a[0].id}:tp"), CancelOrder(a[0].id), CancelAll("X")]


def test_capabilities_are_enforced_when_orders_are_emitted():
    caps = hb.EngineCapabilities(name="tiny")
    with pytest.raises(hb.UnsupportedFeature, match="order:limit") as info:
        act(lambda s, c: s.buy(1, limit=99), caps=caps)
    assert info.value.engine == "tiny" and info.value.missing == ["order:limit"]
    with pytest.raises(hb.UnsupportedFeature, match="trail:percent"):
        act(lambda s, c: s.buy(1, trail=hb.Trail.percent(1)), caps=caps)
    act(lambda s, c: s.buy(1), caps=caps)  # market is fine
    assert (
        caps.supports("tif:day") and not caps.supports("tif:gtc") and not caps.supports("session")
    )


# ---------------------------------------------------------------------------- history / runner


def test_runner_history_dispatches_events_and_tracks_round_trips():
    calls = []

    class H(hb.Strategy):
        def on_start(self):
            calls.append("start")

        def on_fill(self, fill):
            calls.append(f"fill:{fill.side}")

        def on_exit(self, trade):
            calls.append(f"exit:{trade.pnl:.1f}")

        def on_reject(self, r):
            calls.append(f"reject:{r.reason}")

        def on_cancel(self, c):
            calls.append(f"{c.kind}:{c.id}")

        def on_bar(self, ctx):
            calls.append(f"bar:{len(self.history())}")

    runner = StrategyRunner(H, ["X"])
    buy = Fill(1, "o1", "f1", "X", "buy", 10, 100.0)
    sell = Fill(2, "o2", "f2", "X", "sell", 10, 110.0, realised_pnl=100.0, costs=Costs(total=4.0))
    runner(_ctx(1, events=[buy]))
    runner(
        _ctx(
            2,
            events=[
                sell,
                hb.strategy.Reject(2, "o3", "X", "buy", 1, "no_price"),
                hb.strategy.Cancel("expire", 2, "o4", "X", "day"),
            ],
        )
    )
    assert calls == [
        "start",
        "fill:buy",
        "bar:1",
        "fill:sell",
        "exit:96.0",
        "reject:no_price",
        "expire:o4",
        "bar:2",
    ]
    assert runner.round_trips[0].pnl == 96.0
    assert (
        runner.strategy._status_of("o3") == "rejected"
        and runner.strategy._status_of("o1") == "filled"
    )


def test_history_only_grows_on_new_bars_and_views_are_readonly():
    seen = []

    class H(hb.Strategy):
        def on_bar(self, ctx):
            seen.append(len(self.history()))
            with pytest.raises(ValueError):
                self.history().close[0] = 1.0

    r = StrategyRunner(H, ["X"])
    r(_ctx(1))
    r(_ctx(2))
    stale = BarContext(3, False, 0, 0, {"X": Bar(2, 1, 1, 1, 1)}, {}, (), (), SessionState())
    r(stale)  # symbol has no bar at t=3: its old bar is not appended again
    assert seen == [1, 2, 2]


def test_barbuffer_growth_and_order_check():
    buf = BarBuffer(capacity=2)
    for t in range(1, 6):
        buf.append(Bar(t, t, t, t, t, t))
    view = buf.view()
    assert len(view) == 5 and view.last.close == 5 and view[1:3].close.tolist() == [2.0, 3.0]
    assert view.to_frame().shape == (5, 5) and view.hl2[-1] == 5 and "n=5" in repr(view)
    with pytest.raises(ValueError, match="increasing"):
        buf.append(Bar(5, 1, 1, 1, 1))
    buf.append(Bar(6, 6, 6, 6, 6))
    assert len(view) == 5  # an old view never grows (no look-ahead through stale references)


def test_runner_requires_and_unknown_timeframe():
    class NeedsTrail(Probe):
        requires = ("trail:atr",)

    with pytest.raises(hb.UnsupportedFeature, match="trail:atr"):
        StrategyRunner(NeedsTrail, ["X"], capabilities=hb.EngineCapabilities(name="t"))
    with pytest.raises(ValueError, match="not a multiple"):

        class Odd(Probe):
            timeframe = "5m"
            extra_timeframes = ("7m",)

        StrategyRunner(Odd, ["X"])


# ---------------------------------------------------------------------------- resampling


def push_all(rs, df):
    out = []
    for _, r in df.iterrows():
        out += rs.push(
            Bar(ms(r.time.tz_localize("Asia/Kolkata")), r.open, r.high, r.low, r.close, r.volume)
        )
    return out


def test_resampler_hourly_buckets_anchor_at_session_open():
    df = intraday(days=1, minutes=15)
    bars = push_all(Resampler("1h", "15m", NSE), df)
    starts = [
        pd.Timestamp(b.time_ms, unit="ms", tz="UTC").tz_convert("Asia/Kolkata").strftime("%H:%M")
        for b in bars
    ]
    assert starts == ["09:15", "10:15", "11:15", "12:15", "13:15", "14:15", "15:15"]
    first = df.iloc[:4]
    assert (bars[0].open, bars[0].close) == (first.open.iloc[0], first.close.iloc[-1])
    assert (
        bars[0].high == first.high.max()
        and bars[0].low == first.low.min()
        and bars[0].volume == first.volume.sum()
    )
    assert bars[-1].volume == df.volume.iloc[-1]  # the 15:15 stub is one 15m bar


def test_resampler_publishes_only_on_the_last_base_bar_of_a_bucket():
    df = intraday(days=1, minutes=5)
    rs = Resampler("1h", "5m", NSE)
    published_at = [
        i
        for i, (_, r) in enumerate(df.iterrows())
        if rs.push(Bar(ms(r.time.tz_localize("Asia/Kolkata")), r.open, r.high, r.low, r.close, 1))
    ]
    # bucket 1 = base bars 0..11 (09:15-10:10); it appears at index 11, never earlier
    assert published_at[0] == 11 and published_at[1] == 23 and published_at[-1] == len(df) - 1


def test_resampler_daily_weekly_and_gaps():
    df = intraday(days=6, minutes=15)  # Mon..Mon
    daily_bars = push_all(Resampler("1d", "15m", NSE), df)
    assert len(daily_bars) == 6
    weekly = push_all(Resampler("1w", "15m", NSE), df)
    assert len(weekly) == 1 + 0  # Mon-Fri week closed at Friday's last bar; Monday still forming
    # a missing tail: the forming bucket is flushed when the next day's first bar arrives
    rs = Resampler("1d", "15m", NSE)
    assert rs.push(Bar(ms(DAY0), 1, 2, 1, 1.5, 1)) == []
    out = rs.push(Bar(ms(DAY0 + pd.Timedelta(days=1)), 3, 3, 3, 3, 1))
    assert len(out) == 1 and out[0].close == 1.5
    with pytest.raises(ValueError, match="down to"):
        Resampler("5m", "15m")
    with pytest.raises(ValueError):
        Resampler("1h", "1d")
    with pytest.raises(ValueError, match="invalid timeframe"):
        hb.strategy.Timeframe.parse("abc")
    assert str(hb.strategy.Timeframe.parse("15M")) == "15m"
    assert Resampler("15m", "15m").push(Bar(1, 1, 1, 1, 1)) == [Bar(1, 1, 1, 1, 1)]


# ---------------------------------------------------------------------------- indicators


def test_indicators_match_reference_values():
    x = np.arange(1.0, 31.0)
    assert hb.ta.sma(x, 5) == 28.0 and np.isnan(hb.ta.sma(x, 5, True)[:4]).all()
    assert hb.ta.ema(np.array([1.0, 1, 1, 1]), 3) == 1.0
    assert hb.ta.highest(x, 3) == 30 and hb.ta.lowest(x, 3) == 28
    assert hb.ta.stddev(np.array([1.0, 3.0]), 2) == 1.0
    assert hb.ta.rsi(x, 14) == 100.0  # only gains
    assert hb.ta.rsi(x[::-1], 14) == 0.0
    tr = hb.ta.true_range(x + 1, x - 1, x)
    assert tr[0] == 2 and hb.ta.atr(x + 1, x - 1, x, 14) == pytest.approx(2.0)
    assert hb.ta.roc(x, 10) == pytest.approx(30 / 20 - 1)
    up = hb.ta.bollinger(np.array([1.0, 2, 3, 4, 5]), 5)
    assert up.middle == 3.0 and up.upper > up.middle > up.lower
    m = hb.ta.macd(x)
    assert m.macd > 0 and m.signal > 0
    assert hb.ta.vwap([2, 4], [0, 2], [1, 3], [1, 1], sessions=[1, 2]) == pytest.approx(3.0)
    assert hb.ta.vwap([2, 4], [0, 2], [1, 3], [1, 1]) == pytest.approx(2.0)


def test_crossovers_handle_nan_and_levels():
    f, s = np.array([1.0, 2, 3]), np.array([2.0, 2, 2])
    assert hb.ta.crossed_above(f, s) and not hb.ta.crossed_below(f, s)
    assert hb.ta.crossed_below(f[::-1], s) and hb.ta.crossed_above(f, 2.5)
    assert not hb.ta.crossed_above(np.array([np.nan, 1.0]), np.array([0.0, 0.0]))


# ---------------------------------------------------------------------------- round trips


def mkfill(t, side, qty, price, pnl=0.0, cost=0.0, sym="X", reason="signal", tag=None):
    return Fill(
        t,
        f"o{t}",
        f"f{t}",
        sym,
        side,
        qty,
        price,
        qty * price,
        Costs(total=cost),
        pnl,
        "CNC",
        tag,
        reason,
    )


def test_round_trips_scale_partial_and_flip():
    fills = [
        mkfill(1, "buy", 10, 100, cost=1.0),
        mkfill(2, "buy", 10, 110, cost=1.0),  # scale in: avg 105
        mkfill(3, "sell", 5, 120, pnl=75.0, cost=0.5),  # partial exit
        mkfill(
            4, "sell", 25, 100, pnl=-75.0, cost=2.5, tag="flip"
        ),  # closes 15 long, opens 10 short
        mkfill(5, "buy", 10, 90, pnl=100.0, cost=1.0, reason="take_profit"),
    ]
    trips = round_trips_from_fills(fills)
    assert len(trips) == 2
    long_, short = trips
    assert (long_.side, long_.qty, long_.entry_price) == ("long", 20, 105.0)
    assert long_.exit_price == pytest.approx((5 * 120 + 15 * 100) / 20)
    assert long_.gross_pnl == 0.0 and long_.costs == pytest.approx(1 + 1 + 0.5 + 2.5 * 15 / 25)
    assert (short.side, short.qty, short.entry_price, short.exit_price) == ("short", 10, 100, 90)
    assert short.exit_reason == "take_profit" and short.gross_pnl == 100.0
    assert short.costs == pytest.approx(2.5 * 10 / 25 + 1.0) and short.pnl == pytest.approx(
        100 - 2.0
    )
    assert short.holding.total_seconds() == 1e-3 and short.return_pct == pytest.approx(
        short.pnl / 1000
    )
    tracker = RoundTripTracker()
    tracker.push(mkfill(1, "buy", 5, 10))
    assert tracker.open_qty("X") == 5  # still open: not a round trip


# ---------------------------------------------------------------------------- validation / data


def test_candle_validation_findings():
    def kinds(df, **kw):
        return {i.kind for i in validate_candles(to_candles({"X": df}), **kw)}

    good = daily(flat(100, 5))
    assert kinds(good, session=NSE, timeframe="1d") == set()
    bad = good.copy()
    bad.loc[1, "close"] = np.nan
    bad.loc[2, ["open", "high", "low", "close"]] = [100, 99, 101, 100]
    bad.loc[3, "volume"] = -1
    assert kinds(bad) >= {"nan", "ohlc", "volume"}
    assert kinds(good.iloc[[1, 0, 2, 3, 4]]) == {"unsorted"}
    dup = good.iloc[[0, 0, 1, 2, 3, 4]]
    assert "duplicate" in kinds(dup)
    assert "price" in kinds(daily([(0, 1, 0, 0.5), *flat(100, 2)]))
    assert kinds(good.iloc[:0]) == {"empty"}


def test_session_aware_validation_holidays_weekends_hours_and_gaps():
    cfg = hb.TradingSession(holidays=frozenset({date(2024, 1, 2)}))
    df = daily(flat(100, 5))  # Mon-Fri, Tue is a holiday
    found = validate_candles(to_candles({"X": df}), session=cfg, timeframe="1d")
    assert [(i.kind, i.count) for i in found] == [("holiday", 1)]
    weekend = daily(flat(100, 2)).assign(
        time=pd.to_datetime(["2024-01-06", "2024-01-08"])
    )  # Sat, Mon
    assert (
        validate_candles(to_candles({"X": weekend}), session=NSE, timeframe="1d")[0].kind
        == "holiday"
    )
    assert (
        validate_candles(to_candles({"X": weekend}), session=hb.TradingSession(trade_weekends=True))
        == []
    )

    idf = intraday(days=2, minutes=5)
    assert validate_candles(to_candles({"X": idf}), session=NSE, timeframe="5m") == []
    outside = idf.copy()
    outside.loc[0, "time"] -= pd.Timedelta(minutes=30)  # 08:45, before the open
    assert {i.kind for i in validate_candles(to_candles({"X": outside}), session=NSE)} == {
        "outside_session"
    }
    gap = idf.drop(index=[10, 11, 12])  # 3 missing bars inside a session
    (issue,) = validate_candles(to_candles({"X": gap}), session=NSE, timeframe="5m")
    assert (issue.kind, issue.level) == ("gap", "warning")
    overnight = idf.drop(
        index=range(70, 80)
    )  # gap spanning the close/open is fine only if session-crossing
    assert all(
        i.kind != "holiday"
        for i in validate_candles(to_candles({"X": overnight}), session=NSE, timeframe="5m")
    )


def test_validation_policy_error_warn_off():
    bad = daily(flat(100, 3))
    bad.loc[1, "close"] = np.nan
    from sdk_helpers import SmaCross

    with pytest.raises(hb.CandleValidationError) as info:
        hb.backtest(SmaCross, {"X": bad}, hb.BacktestConfig(), engine="simple")
    assert info.value.issues[0].kind == "nan"
    with pytest.warns(UserWarning, match="nan"):
        hb.backtest(SmaCross, {"X": bad}, hb.BacktestConfig(validation="warn"), engine="simple")
    with warnings.catch_warnings():
        warnings.simplefilter("error")
        hb.backtest(SmaCross, {"X": bad}, hb.BacktestConfig(validation="off"), engine="simple")


def test_to_candles_time_handling_and_inputs():
    naive = pd.DataFrame(
        {"time": pd.to_datetime(["2024-01-01 09:15"]), "open": 1, "high": 1, "low": 1, "close": 1}
    )
    assert to_candles({"X": naive})["X"].time_ms[0] == ms("2024-01-01 09:15+05:30")  # naive = IST
    aware = naive.assign(time=pd.to_datetime(["2024-01-01 03:45"]).tz_localize("UTC"))
    assert to_candles({"X": aware})["X"].time_ms[0] == ms("2024-01-01 09:15+05:30")
    secs = pd.DataFrame(
        {"timestamp": [1_704_057_300, 1_704_057_360], "open": 1, "high": 1, "low": 1, "close": 1}
    )
    assert to_candles(secs, "X")["X"].time_ms.tolist() == [1_704_057_300_000, 1_704_057_360_000]
    assert to_candles(pl.from_pandas(naive), "X")["X"].volume.tolist() == [0.0]
    long = pd.concat([naive.assign(symbol="A"), naive.assign(symbol="B")])
    assert set(to_candles(long)) == {"A", "B"} and list(to_candles(long, ["B"])) == ["B"]
    with pytest.raises(ValueError, match="missing columns"):
        to_candles({"X": naive.drop(columns="close")})
    with pytest.raises(ValueError, match="no candles for symbols"):
        to_candles({"X": naive}, ["Y"])
    with pytest.raises(ValueError, match="symbol"):
        to_candles(naive)
    idx = naive.set_index("time").drop(columns=[])
    assert len(to_candles({"X": idx})["X"]) == 1  # datetime index works


def test_config_start_conversions():
    assert hb.BacktestConfig(start="2024-01-01 09:15").start_ms == ms("2024-01-01 09:15+05:30")
    assert hb.BacktestConfig(start=1_704_057_300).start_ms == 1_704_057_300_000
    assert hb.BacktestConfig(start=date(2024, 1, 1)).start_ms == ms("2024-01-01 00:00+05:30")
    assert hb.BacktestConfig().start_ms is None
    with pytest.raises(ValueError):
        hb.BacktestConfig(capital=0)
    assert hb.BacktestConfig().with_(capital=5).capital == 5


# ---------------------------------------------------------------------------- metrics


def test_metrics_from_synthetic_equity_and_trips():
    idx = pd.date_range("2024-01-01", periods=6, freq="D", tz="Asia/Kolkata")
    equity = pd.Series([100, 110, 99, 120, 120, 132.0], index=idx)
    trips = round_trips_from_fills(
        [
            mkfill(1, "buy", 1, 10),
            mkfill(2, "sell", 1, 20, pnl=10.0),
            mkfill(3, "sell", 1, 20),
            mkfill(4, "buy", 1, 25, pnl=-5.0),
        ]
    )
    m = compute_metrics(trips, equity, 100.0)
    assert (m.total_trades, m.winning_trades, m.losing_trades) == (2, 1, 1)
    assert (m.longs, m.shorts, m.long_pnl, m.short_pnl) == (1, 1, 10.0, -5.0)
    assert m.net_profit == 32.0 and m.max_drawdown == pytest.approx(0.1)
    assert m.longest_underwater_days == pytest.approx(2.0)  # peak 110 (day 1) -> new high day 3
    assert m.best_day == pytest.approx(0.2121, abs=1e-3) and m.worst_day == pytest.approx(-0.1)
    assert m.sharpe > 0 and m.sortino > 0 and m.omega > 1 and m.cagr > 0 and m.calmar > 0
    assert m.profit_factor == pytest.approx(2.0) and m.expectancy == pytest.approx(2.5)
    assert m.as_dict()["win_rate"] == 0.5
    flat_m = compute_metrics([], equity.iloc[:1] * 0 + 100, 100.0)
    assert flat_m.total_trades == 0 and flat_m.win_rate is None and flat_m.sharpe is None
    rets = daily_returns(equity, 100.0)
    assert rets.iloc[0] == 0.0 and len(rets) == 6
