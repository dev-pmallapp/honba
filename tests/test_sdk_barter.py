"""SDK behaviour against the REAL compiled barter engine (``honba._core``)."""
# ruff: noqa: D101, D102, D103

from __future__ import annotations

import pytest
from honba.strategy.types import Fill, Reject, TrailUpdate
from sdk_helpers import SmaCross, daily, flat, intraday, trending

import honba as hb

pytest.importorskip("honba._core", reason="build the engine first: maturin develop")

CFG = hb.BacktestConfig(capital=100_000.0)


class Recorder(hb.Strategy):
    """Base for tests: records every event and exit the engine reports."""

    def on_start(self):
        self.fills, self.rejects, self.cancels, self.trails, self.exits = [], [], [], [], []

    def on_fill(self, fill):
        self.fills.append(fill)

    def on_reject(self, reject):
        self.rejects.append(reject)

    def on_cancel(self, cancel):
        self.cancels.append(cancel)

    def on_exit(self, trade):
        self.exits.append(trade)

    def _collect_trails(self, ctx):
        self.trails += [e for e in ctx.events if isinstance(e, TrailUpdate)]


def run(strategy, rows, config=CFG, **kw):
    """Backtest one symbol ``X`` built from daily OHLC ``rows``."""
    return hb.backtest(strategy, {"X": daily(rows)}, config, **kw)


# --------------------------------------------------------------------------- bracket exits


class BracketBuy(Recorder):
    def on_bar(self, ctx):
        if len(self.history()) == 3 and self.position.is_flat:
            self.buy(10, stop_loss=95, take_profit=110, tag="bracket")


def test_bracket_take_profit_exit():
    rows = [*flat(100, 3), (100, 111, 99, 108), (108, 109, 107, 108)]
    res = run(BracketBuy, rows)
    fills = res.fills
    assert list(fills.reason) == ["signal", "take_profit"]
    assert list(fills.price) == [100.0, 110.0]
    trip = res.round_trips[0]
    assert (trip.side, trip.exit_reason, trip.gross_pnl) == ("long", "take_profit", 100.0)
    assert res.summary["net_pnl"] == pytest.approx(100.0)
    assert len(res.trades) == 1 and res.trades.pnl[0] == pytest.approx(100.0)
    statuses = dict(zip(res.orders.id, res.orders.status, strict=True))
    assert statuses == {"s1": "filled", "s1:tp": "filled", "s1:sl": "cancelled"}


def test_bracket_stop_loss_exit_and_gap_through():
    rows = [*flat(100, 3), (100, 101, 99, 100), (90, 92, 88, 91)]  # gaps below the stop
    res = run(BracketBuy, rows)
    exit_fill = res.fills.iloc[-1]
    assert exit_fill.reason == "stop_loss"
    assert exit_fill.price == 90.0  # gap fills at the open, not at the stop
    assert res.summary["net_pnl"] == pytest.approx(-100.0)


def test_on_exit_and_on_fill_hooks_fire_with_typed_events():
    seen = {}

    class Hooked(BracketBuy):
        def on_exit(self, trade):
            seen["trip"] = trade

        def on_fill(self, fill):
            seen.setdefault("fills", []).append(fill)

    run(Hooked, [*flat(100, 3), (100, 111, 99, 108), (108, 108, 108, 108)])
    assert [type(f) for f in seen["fills"]] == [Fill, Fill]
    assert seen["fills"][1].reason == "take_profit"
    assert seen["trip"].exit_reason == "take_profit" and seen["trip"].entry_tag == "bracket"


# --------------------------------------------------------------------------- trailing stop


class TrailBuy(Recorder):
    def on_bar(self, ctx):
        self._collect_trails(ctx)
        if len(self.history()) == 3 and self.position.is_flat:
            self.buy(10, stop_loss=95, trail=hb.Trail.percent(5), tag="trail")
        if len(self.history()) == 9:
            TrailBuy.seen = list(self.trails)


def test_trailing_stop_ratchets_up_only_then_exits():
    rows = [
        *flat(100, 3),
        (100, 101, 99, 101),
        (101, 105, 100, 105),
        (105, 110, 104, 110),
        (110, 120, 109, 120),
        (120, 121, 118, 119),  # pullback above the 114 trail: stop must not move down
        (119, 119, 113, 114),  # trades through 114 -> stopped out
    ]
    res = run(TrailBuy, rows)
    stops = [t.new_stop for t in TrailBuy.seen]
    # 5% under each new high (101, 105, 110, 120, 121); the 119 pullback moves nothing
    assert stops == pytest.approx([95.95, 99.75, 104.5, 114.0, 114.95])
    assert stops == sorted(stops)  # ratcheted, never loosened
    exit_fill = res.fills.iloc[-1]
    assert exit_fill.reason == "trailing_stop" and exit_fill.price == pytest.approx(114.95)
    assert res.round_trips[0].gross_pnl == pytest.approx(149.5)
    order = res.orders.set_index("id").loc["s1:sl"]
    assert order.trail_stop == pytest.approx(114.95)


def test_trailing_stop_with_amount_and_activation():
    class Amount(Recorder):
        def on_bar(self, ctx):
            if len(self.history()) == 3 and self.position.is_flat:
                self.buy(10, stop_loss=95, trail=hb.Trail.amount(4, activation=105), tag="amt")

    rows = [
        *flat(100, 3),
        (100, 103, 99, 103),  # below activation: stop stays 95
        (103, 110, 102, 110),  # activates; trail = 110 - 4 = 106
        (110, 110, 105, 106),
    ]
    res = run(Amount, rows)
    assert res.fills.iloc[-1].reason == "trailing_stop"
    assert res.fills.iloc[-1].price == pytest.approx(106.0)


def test_modify_stop_of_live_position_via_exit_order_handle():
    class Manual(Recorder):
        def on_bar(self, ctx):
            n = len(self.history())
            if n == 3:
                self.h = self.buy(10, stop_loss=90, take_profit=200)
            if n == 4:
                self.modify(self.h.stop_order, stop=99)  # tighten from 90 to 99

    rows = [*flat(100, 3), (100, 101, 100, 101), (101, 101, 98, 100), (100, 100, 100, 100)]
    res = run(Manual, rows)
    last = res.fills.iloc[-1]
    assert (last.reason, last.price) == ("stop_loss", 99.0)  # would not have hit 90


# --------------------------------------------------------------------------- limit orders


class LimitBuy(Recorder):
    def on_bar(self, ctx):
        if len(self.history()) == 2 and not self.orders():
            self.buy(10, limit=98, tag="dip")


def test_limit_order_rests_then_fills_at_limit():
    rows = [*flat(100, 2), (100, 101, 97, 99), (99, 100, 99, 100)]
    res = run(LimitBuy, rows)
    fill = res.fills.iloc[0]
    assert (fill.reason, fill.price, fill.qty) == ("limit", 98.0, 10.0)
    assert res.orders.set_index("id").loc["s1"].status == "filled"


def test_limit_order_gap_fills_at_open():
    rows = [*flat(100, 2), (96, 99, 95, 98), (98, 98, 98, 98)]
    res = run(LimitBuy, rows)
    assert res.fills.iloc[0].price == 96.0


def test_day_limit_expires_and_gtc_survives_and_cancel_all():
    class Orders(Recorder):
        def on_bar(self, ctx):
            if len(self.history()) == 2:
                self.buy(1, limit=50, tif="day")
                self.buy(2, limit=50, tif="gtc")
            if len(self.history()) == 4:
                self.cancel_all()

    res = run(Orders, [*flat(100, 6)])
    by_id = res.orders.set_index("id")
    assert by_id.loc["s2", "status"] == "cancelled"  # gtc lived until cancel_all
    assert by_id.loc["s1", "status"] in ("expired", "cancelled")


def test_cancel_and_modify_open_order():
    class Mod(Recorder):
        def on_bar(self, ctx):
            n = len(self.history())
            if n == 2:
                self.h = self.buy(10, limit=90, tif="gtc")
            if n == 3:
                self.h.modify(limit=95)  # bar 4 trades down to 96 -> not filled at 95
            if n == 5:
                self.h.cancel()

    rows = [*flat(100, 3), (100, 100, 96, 97), (97, 97, 97, 97), (97, 97, 97, 97)]
    res = run(Mod, rows)
    order = res.orders.set_index("id").loc["s1"]
    assert order.status == "cancelled" and order.price == 95.0
    assert res.fills.empty


# --------------------------------------------------------------------------- smart orders


def test_target_close_and_close_all_net_open_orders_and_positions():
    class Smart(Recorder):
        def on_bar(self, ctx):
            n = len(self.history())
            if n == 2:
                self.target(qty=10)
                self.target(qty=10)  # same bar again: nets against the queued order
            if n == 3:
                self.target(qty=25)  # +15
            if n == 4:
                self.target(qty=25)  # already there: nothing sent
            if n == 5:
                self.target(pct=0.5)  # 50% of equity ~ 500 shares at 100 -> +475
            if n == 6:
                self.close()

    res = run(Smart, [*flat(100, 8)])
    signed = [(f.side, f.qty) for f in res.fills.itertuples()]
    assert signed[:2] == [("buy", 10.0), ("buy", 15.0)]
    assert res.positions["X"].is_flat
    assert len(res.round_trips) == 1 and res.round_trips[0].qty == pytest.approx(500.0)


def test_close_cancels_resting_entry_orders():
    class C(Recorder):
        def on_bar(self, ctx):
            n = len(self.history())
            if n == 2:
                self.buy(10, limit=50)
            if n == 3:
                self.close()

    res = run(C, [*flat(100, 5)])
    assert res.fills.empty
    assert res.orders.set_index("id").loc["s1", "status"] == "cancelled"


def test_close_all_flattens_every_symbol():
    class Multi(Recorder):
        def on_bar(self, ctx):
            n = len(self.history("A"))
            if n == 2:
                self.buy(5, "A")
                self.buy(7, "B")
            if n == 4:
                self.close_all()

    data = {"A": daily(flat(100, 6)), "B": daily(flat(50, 6))}
    res = hb.backtest(Multi, data, CFG)
    assert all(p.is_flat for p in res.positions.values())
    assert {t.symbol for t in res.round_trips} == {"A", "B"}


def test_short_needs_mis_or_allow_short_and_rejects_are_reported():
    class Short(Recorder):
        def on_bar(self, ctx):
            if len(self.history()) == 2:
                self.sell(5)
            Short.rejects = self.rejects

    res = run(Short, [*flat(100, 4)])
    assert res.report.rejected and res.report.rejected[0].reason == "insufficient_position"
    assert isinstance(Short.rejects[0], Reject)  # delivered to on_reject as a typed event

    cfg = hb.BacktestConfig(capital=100_000.0, allow_short=True)
    assert not run(Short, [*flat(100, 4)], cfg).report.rejected


def test_insufficient_cash_reject_event():
    class Big(Recorder):
        def on_bar(self, ctx):
            if len(self.history()) == 2:
                self.buy(10_000)

    res = run(Big, [*flat(100, 4)])
    assert res.rejected.reason.tolist() == ["insufficient_cash"]


# --------------------------------------------------------------------------- warm-up


def test_warmup_bars_ignore_orders_and_start_equity_later():
    class Always(Recorder):
        def on_bar(self, ctx):
            if ctx.warmup:
                self.buy(1)  # silently ignored by the SDK
            elif self.position.is_flat:
                self.buy(1)

    cfg = hb.BacktestConfig(capital=10_000.0, warmup_bars=3)
    res = run(Always, [*flat(100, 6)], cfg)
    assert res.report.warmup_bars == 3 and len(res.equity) == 3
    assert res.report.rejected == []
    assert res.fills.iloc[0].time == res.equity.index[0]


# --------------------------------------------------------------------------- multi-timeframe


class MtfProbe(Recorder):
    timeframe = "5m"
    extra_timeframes = ("1h", "1d")

    def on_bar(self, ctx):
        ctx_time = ctx.time_ms
        if not hasattr(self, "log_"):
            self.log_ = []
        hourly, daily_ = self.history(tf="1h"), self.history(tf="1d")
        for tf, bars, span in (("1h", hourly, 3_600_000), ("1d", daily_, None)):
            if len(bars):
                last = bars.last
                end = last.time_ms + span if span else None
                self.log_.append((tf, ctx_time, last.time_ms, end, len(bars)))
        MtfProbe.log = self.log_
        MtfProbe.base = self.history()
        MtfProbe.hourly = hourly
        MtfProbe.daily = daily_


def test_multi_timeframe_only_exposes_closed_bars_anchored_at_0915():
    data = intraday(days=2, minutes=5)
    cfg = hb.BacktestConfig(capital=100_000.0, session=hb.TradingSession())
    hb.backtest(MtfProbe, {"X": data}, cfg)
    base_ms = 5 * 60_000
    first_1h = next(r for r in MtfProbe.log if r[0] == "1h")
    # the 09:15 hourly bar is published at the base bar opening 10:10 (it closes at 10:15)
    ist = lambda ms: (ms + 19_800_000) % 86_400_000 // 60_000  # noqa: E731 - minute of day
    assert ist(first_1h[2]) == 9 * 60 + 15
    assert ist(first_1h[1]) == 10 * 60 + 10
    # never any bar whose end lies beyond the current bar's close (no look-ahead)
    for tf, now, start, _end, _ in MtfProbe.log:
        if tf == "1h":
            end = start + (15 if ist(start) == 915 else 60) * 60_000  # last bucket is clipped
            assert end <= now + base_ms
    # hourly buckets are 09:15, 10:15 ... 15:15 (last is a 15-minute stub) -> 7 per session
    starts = {ist(t) for t in MtfProbe.hourly.time_ms}
    assert starts == {555, 615, 675, 735, 795, 855, 915}
    assert len(MtfProbe.hourly) == 14 and len(MtfProbe.daily) == 2
    # the daily bar of day 1 aggregates exactly that session, and shows up only at its last bar
    day1 = data.iloc[:75]
    d1 = MtfProbe.daily[0]
    assert (d1.open, d1.high, d1.low, d1.close) == (
        day1.open.iloc[0],
        day1.high.max(),
        day1.low.min(),
        day1.close.iloc[-1],
    )
    first_daily = next(r for r in MtfProbe.log if r[0] == "1d")
    assert ist(first_daily[1]) == 15 * 60 + 25


def test_undeclared_timeframe_is_a_clear_error():
    class Bad(hb.Strategy):
        def on_bar(self, ctx):
            self.history(tf="1h")

    with pytest.raises(ValueError, match="extra_timeframes"):
        run(Bad, [*flat(100, 3)])


# --------------------------------------------------------------------------- sizing / instruments


class SizedFuture(Recorder):
    def on_bar(self, ctx):
        if len(self.history()) == 3 and self.position.is_flat:
            qty = self.size.by_risk(0.01, entry=ctx.bar.close, stop=ctx.bar.close - 2)
            SizedFuture.qty = qty
            self.buy(qty, stop_loss=ctx.bar.close - 2, limit=None, product=hb.NRML, tag="sized")
        if len(self.history()) == 4:
            SizedFuture.rounded = self.buy(80, product=hb.NRML)  # 80 -> one lot (75)


def test_sizing_rounds_to_lots_and_ticks_and_engine_accepts():
    inst = {
        "X": hb.Instrument("equity_futures", lot_size=75, tick_size=0.05, default_product="NRML")
    }
    cfg = hb.BacktestConfig(capital=5_000_000.0, instruments=inst)
    res = run(SizedFuture, [*flat(100.03, 6)], cfg)
    assert SizedFuture.qty % 75 == 0 and SizedFuture.qty > 0
    assert res.rejected.empty  # no invalid_lot / invalid_tick from the engine
    assert res.fills.qty.tolist()[:2] == [SizedFuture.qty, 75.0]
    entry_order = res.orders.set_index("id").loc["s1:sl"]
    assert entry_order.trigger == pytest.approx(98.05)  # 98.03 rounded to the 0.05 tick


def test_engine_rejects_off_lot_orders_without_sdk_rounding_help():
    # sanity check of the engine contract itself: the SDK rounds, the engine would reject
    inst = {"X": hb.Instrument("equity_futures", lot_size=75, tick_size=0.05)}
    cfg = hb.BacktestConfig(capital=5_000_000.0, instruments=inst)

    class Raw(Recorder):
        def on_bar(self, ctx):
            if len(self.history()) == 2:
                self.buy(10)  # below one lot: the SDK skips it, nothing is sent

    res = run(Raw, [*flat(100, 4)], cfg)
    assert res.fills.empty and res.rejected.empty


# --------------------------------------------------------------------------- costs / metrics


def test_india_costs_and_metrics_reconcile_with_engine_summary():
    class Round(Recorder):
        def on_bar(self, ctx):
            n = len(self.history())
            if n == 2:
                self.buy(100, product=hb.CNC)
            if n == 6:
                self.close()

    rows = [
        *flat(100, 3),
        (100, 110, 100, 105),
        (105, 112, 104, 110),
        (110, 115, 108, 112),
        *flat(112, 2),
    ]
    cfg = hb.BacktestConfig(capital=100_000.0, costs=hb.CostModel.india())
    res = run(Round, rows, cfg)
    s = res.summary
    assert s["total_fees"] > 0 and s["costs"]["stt"] > 0
    assert sum(t.pnl for t in res.round_trips) == pytest.approx(s["net_pnl"])
    m = res.metrics
    assert m.total_trades == 1 and m.winning_trades == 1 and m.win_rate == 1.0
    assert m.net_profit == pytest.approx(s["net_pnl"]) and m.total_costs == pytest.approx(
        s["total_fees"]
    )
    assert res.equity_curve.drawdown.max() <= 0
    assert res.raw["summary"]["net_pnl"] == s["net_pnl"]  # raw report exposed untouched


def test_metrics_streaks_and_long_short_split():
    class Flip(Recorder):
        def on_bar(self, ctx):
            n = len(self.history())
            if n in (2, 5):
                self.buy(10)
            if n in (4, 6):
                self.close()

    rows = [
        *flat(100, 2), (100, 110, 100, 110), (110, 110, 110, 110), (110, 110, 110, 110),
        (110, 110, 100, 100), (100, 100, 100, 100), (100, 100, 100, 100), (100, 100, 100, 100),
    ]  # fmt: skip
    res = run(Flip, rows)
    m = res.metrics
    assert m.total_trades == 2 and m.longs == 2 and m.shorts == 0
    assert (m.max_win_streak, m.max_loss_streak) == (1, 1)
    assert m.largest_win == pytest.approx(100.0) and m.largest_loss == pytest.approx(-100.0)
    assert m.profit_factor == pytest.approx(1.0)


# --------------------------------------------------------------------------- sweep / validation


def test_sweep_grid_sorted_with_trial_count_and_bounds_check():
    data = {"X": trending(150, seed=3)}
    frame = hb.sweep(SmaCross, data, {"fast": [3, 5, 8], "slow": [15, 25]}, CFG)
    assert len(frame) == 6 and frame.attrs["n_trials"] == 6
    assert frame.net_pnl.is_monotonic_decreasing
    assert {"fast", "slow", "net_pnl", "sharpe", "total_trades"} <= set(frame.columns)
    assert frame.attrs["results"][0].summary["net_pnl"] == frame.net_pnl.iloc[0]
    with pytest.raises(ValueError, match="above high"):
        hb.sweep(SmaCross, data, {"fast": [3, 99]}, CFG)
    with pytest.raises(ValueError, match="undeclared"):
        hb.sweep(SmaCross, data, {"nope": [1]}, CFG)


def test_sweep_default_grid_from_declared_params_and_process_pool():
    data = {"X": trending(150, seed=3)}
    serial = hb.sweep(SmaCross, data, {"fast": [3, 5], "slow": [15, 25]}, CFG)
    pooled = hb.sweep(SmaCross, data, {"fast": [3, 5], "slow": [15, 25]}, CFG, jobs=2)
    assert serial.net_pnl.tolist() == pooled.net_pnl.tolist()


def test_candle_validation_blocks_bad_data():
    good = daily(flat(100, 5))
    bad_nan = good.copy()
    bad_nan.loc[2, "close"] = float("nan")
    with pytest.raises(hb.CandleValidationError, match="nan"):
        hb.backtest(SmaCross, {"X": bad_nan}, CFG)
    shuffled = good.iloc[[1, 0, 2, 3, 4]]
    with pytest.raises(hb.CandleValidationError, match="unsorted"):
        hb.backtest(SmaCross, {"X": shuffled}, CFG)
    hb.backtest(SmaCross, {"X": shuffled}, hb.BacktestConfig(sort_candles=True))  # sorts first


def test_strategy_exception_propagates_unchanged():
    class Boom(hb.Strategy):
        def on_bar(self, ctx):
            raise KeyError("boom")

    with pytest.raises(KeyError, match="boom"):
        run(Boom, [*flat(100, 3)])


def test_result_frames_and_repr():
    res = run(BracketBuy, [*flat(100, 3), (100, 111, 99, 108), (108, 109, 107, 108)])
    assert {"time", "order_id", "reason", "fees", "stt"} <= set(res.fills.columns)
    assert {"symbol", "pnl", "holding", "exit_reason"} <= set(res.trades.columns)
    assert "s1:tp" in set(res.orders.id) and "BacktestResult" in repr(res)
    assert isinstance(res.metrics.as_dict(), dict)
