"""Entry filters (J25), bar-time logs (J32), PortfolioStrategy (J30/J31), basket groups (O4)."""
# ruff: noqa: D101, D102, D103

from __future__ import annotations

import pandas as pd
import pytest
from sdk_helpers import daily, flat, trending

import honba as hb

CFG = hb.BacktestConfig(capital=100_000.0)
ENGINES = [
    "simple",
    pytest.param("barter", marks=pytest.mark.skipif(
        not __import__("importlib").util.find_spec("honba._core"), reason="honba._core not built"
    )),
]  # fmt: skip


def _universe(n: int = 90) -> dict[str, pd.DataFrame]:
    return {f"S{i}": trending(n, seed=20 + i, drift=0.05 * (i - 1)) for i in range(3)}


# ---------------------------------------------------------------------------- filters (J25)


@pytest.mark.parametrize("engine", ENGINES)
def test_filters_gate_entries_but_never_exits(engine):
    class Gated(hb.Strategy):
        def filters(self):
            return [self.after_warm, self.not_after_exit]

        def after_warm(self):
            return len(self.history()) >= 5

        def not_after_exit(self, symbol, side):
            assert symbol == "X" and side in ("buy", "sell")
            return len(self.history()) < 8

        def on_bar(self, ctx):
            n = len(self.history())
            if self.position.is_flat:
                self.buy(10)
            elif n == 9:
                self.close()  # an exit: filters do not apply even though they fail now

    res = hb.backtest(Gated, {"X": daily(flat(100, 14))}, CFG, engine=engine)
    first = res.fills.time.iloc[0]
    assert first == res.equity.index[4]  # bars 1-4 blocked by after_warm
    assert len(res.round_trips) == 1 and res.round_trips[0].exit_time == res.equity.index[8]
    assert res.open_positions == {}  # re-entries after bar 8 blocked by not_after_exit
    blocked = res.log_frame[res.log_frame.message.str.startswith("filter ")]
    assert blocked.message.iloc[0] == "filter after_warm blocked buy 10 X"
    assert blocked.time.iloc[0] == res.equity.index[0]
    assert "filter not_after_exit blocked buy 10 X" in set(blocked.message)


def test_filters_trim_a_reversal_to_the_exit():
    class Flip(hb.Strategy):
        def filters(self):
            return [lambda: False] if len(self.history()) > 2 else []

        def on_bar(self, ctx):
            n = len(self.history())
            if n == 1:
                self.buy(10)
            if n == 3:
                self.sell(25)  # would reverse to -15: trimmed to the 10 held

    res = hb.backtest(
        Flip, {"X": daily(flat(100, 5))}, CFG.with_(allow_short=True), engine="simple"
    )
    assert res.fills.qty.tolist() == [10, 10]
    assert res.positions["X"].is_flat
    assert any("blocked the reversal of X" in m for m in res.log_frame.message)


# ---------------------------------------------------------------------------- logs (J32)


def test_log_frame_tags_lines_with_the_bar_time():
    class Talk(hb.Strategy):
        def on_start(self):
            self.log("start")

        def on_bar(self, ctx):
            self.log(f"close={ctx.bar.close:g}")

    rows = [(100 + i, 100 + i, 100 + i, 100 + i) for i in range(3)]
    res = hb.backtest(Talk, {"X": daily(rows)}, CFG, engine="simple")
    frame = res.log_frame
    assert frame.message.tolist() == ["start", "close=100", "close=101", "close=102"]
    assert frame.time.tolist()[1:] == list(res.equity.index)
    assert frame.time.iloc[0] == res.equity.index[0]  # on_start runs on the first bar
    assert [m["message"] for m in res.to_dict()["logs"]] == frame.message.tolist()


# ---------------------------------------------------------------------------- groups (O4)


@pytest.mark.parametrize("engine", ENGINES)
def test_basket_groups_tag_fills_orders_trades_and_aggregate(engine):
    class Pairs(hb.Strategy):
        def on_bar(self, ctx):
            n = len(self.history("A"))
            if n == 2:
                with self.group("pair"):
                    self.buy(10, "A")
                    self.buy(5, "B", group="solo")  # explicit group wins
                self.buy(3, "C")  # ungrouped
            if n == 6:
                with self.group("pair"):
                    self.close("A")
                self.close("B")
                self.close("C")

    rows = [(100.0 + i, 100.0 + i, 100.0 + i, 100.0 + i) for i in range(8)]
    data = {s: daily(rows) for s in ("A", "B", "C")}
    res = hb.backtest(Pairs, data, CFG, engine=engine)
    fills = res.fills.astype({"group": object}).where(res.fills.notna(), None)
    by_symbol = {s: g.group.tolist() for s, g in fills.groupby("symbol")}
    assert by_symbol == {"A": ["pair", "pair"], "B": ["solo", None], "C": [None, None]}
    entries = res.orders.drop_duplicates("symbol").set_index("symbol").group
    assert entries[["A", "B"]].tolist() == ["pair", "solo"] and entries.isna()["C"]
    trades = res.trades.set_index("symbol").group
    trades = {k: None if pd.isna(v) else v for k, v in trades.items()}
    assert trades == {"A": "pair", "B": "solo", "C": None}  # the entry's group
    groups = res.groups
    assert list(groups.index) == ["-", "pair", "solo"]
    assert groups.loc["pair", "pnl"] == pytest.approx(res.trades.set_index("symbol").pnl["A"])
    assert groups.trades.sum() == 3
    assert {g["group"] for g in res.to_dict()["groups"]} == {"-", "pair", "solo"}
    assert "<h2>Groups</h2>" in res.tearsheet(charts="svg")


def test_attached_exits_inherit_the_entry_group():
    pytest.importorskip("honba._core")

    class Bracket(hb.Strategy):
        def on_bar(self, ctx):
            if len(self.history()) == 1:
                self.buy(10, stop_loss=95, take_profit=110, group="bracket")

    rows = [*flat(100, 2), (100, 112, 99, 111), *flat(111, 2)]
    res = hb.backtest(Bracket, {"X": daily(rows)}, CFG, engine="barter")
    assert res.fills.reason.tolist()[-1] == "take_profit"
    assert set(res.fills.group) == {"bracket"}
    assert res.groups.loc["bracket", "trades"] == 1


def test_no_groups_means_no_group_columns():
    class Plain(hb.Strategy):
        def on_bar(self, ctx):
            if len(self.history()) == 1:
                self.buy(1)

    res = hb.backtest(Plain, {"X": daily(flat(100, 3))}, CFG, engine="simple")
    assert "group" not in res.fills.columns and res.groups.empty


# ---------------------------------------------------------------------------- portfolio (J30/31)


class EqualWeight(hb.PortfolioStrategy):
    rebalance_every = "month"

    def on_rebalance(self, ctx):
        self.state.setdefault("rebalances", []).append(ctx.time)
        names = self.tradable()
        self.rebalance({s: 0.9 / len(names) for s in names})


@pytest.mark.parametrize("engine", ENGINES)
def test_portfolio_equal_weight_monthly_rebalance(engine):
    data = _universe(90)
    res = hb.backtest(EqualWeight, data, CFG, engine=engine)
    trade_days = sorted(set(res.fills.time))
    first_of_month, seen = [], set()
    for t in res.equity.index:
        if (t.year, t.month) not in seen:
            seen.add((t.year, t.month))
            first_of_month.append(t)
    assert set(trade_days) <= set(first_of_month) and trade_days[0] == res.equity.index[0]
    first = res.fills[res.fills.time == trade_days[0]]
    values = (first.qty * first.price).to_numpy()
    assert values.sum() == pytest.approx(0.9 * CFG.capital, rel=0.01)
    assert values.max() - values.min() < max(first.price) * 1.01  # equal within one share
    assert set(res.fills.group) == {"rebalance"}
    for day in trade_days[1:]:  # reductions are sent before additions
        sides = res.fills[res.fills.time == day].side.tolist()
        assert sides == sorted(sides, key=lambda s: s != "sell")


def test_portfolio_universe_bar_schedule_tolerance_and_state():
    class Two(hb.PortfolioStrategy):
        universe = ("S0", "S2")
        rebalance_every = 5

        def on_rebalance(self, ctx):
            self.state["n"] = self.state.get("n", 0) + 1
            self.rebalance({"S0": 0.4, "S2": 0.4}, tolerance=0.05)

    res = hb.backtest(Two, _universe(30), CFG, engine="simple")
    assert "S1" not in set(res.fills.symbol)
    days = sorted(set(res.fills.time))
    assert days[0] == res.equity.index[0]
    assert all(d in set(res.equity.index[::5]) for d in days)  # every 5 bars at most
    runner = hb.strategy.StrategyRunner(Two, ["S0", "S1", "S2"])
    assert runner.strategy.members() == ("S0", "S2") and runner.strategy.state == {}


def test_rebalance_closes_others_and_validates():
    class Rotate(hb.PortfolioStrategy):
        rebalance_every = "bar"
        bad = hb.Param("none", choices=("none", "gross", "nan", "unknown"))

        def on_rebalance(self, ctx):
            n = len(self.history("S0"))
            if self.bad == "gross":
                self.rebalance({"S0": 0.8, "S1": 0.8})
            elif self.bad == "nan":
                self.rebalance({"S0": float("nan")})
            elif self.bad == "unknown":
                self.rebalance({"ZZZ": 0.1})
            elif n == 1:
                self.rebalance({"S0": 0.5})
            elif n == 3:
                self.rebalance({"S1": 0.5})  # S0 is closed: close_others

    data = _universe(5)
    res = hb.backtest(Rotate, data, CFG, engine="simple")
    assert res.positions["S0"].is_flat and res.positions["S1"].is_open
    third = res.fills[res.fills.time == res.equity.index[2]]
    assert third.side.tolist() == ["sell", "buy"] and third.symbol.tolist() == ["S0", "S1"]
    for bad, match in (("gross", "max_gross"), ("nan", "finite"), ("unknown", "not a symbol")):
        with pytest.raises(ValueError, match=match):
            hb.backtest(Rotate, data, CFG, params={"bad": bad}, engine="simple")


def test_weekly_schedule_starts_on_monday():
    class Weekly(hb.PortfolioStrategy):
        rebalance_every = "week"

        def on_rebalance(self, ctx):
            self.log("rebalance")

    data = {"S0": daily(flat(100, 15), start="2024-01-03")}  # a Wednesday
    res = hb.backtest(Weekly, data, CFG, engine="simple")
    days = [t.strftime("%a %d") for t in res.log_frame.time]
    assert days == ["Wed 03", "Mon 08", "Mon 15", "Mon 22"]
