"""SDK wiring tests against a fake ``honba._core`` (no compiled engine needed)."""
# ruff: noqa: D103

from __future__ import annotations

import importlib.util
import json
import sys
import types
from pathlib import Path

import pandas as pd
import polars as pl
import pytest
from honba.strategy import Strategy, StrategyAdapter, indicators

from honba.research import BacktestResult, backtest, sweep

_spec = importlib.util.spec_from_file_location(
    "sma_cross", Path(__file__).parent.parent / "strategies" / "sma_cross.py"
)
assert _spec and _spec.loader
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)
SmaCross = _mod.SmaCross


class FakeCore(types.ModuleType):
    """Replays candles through on_bar with a trivial instant-fill position model."""

    def __init__(self):
        super().__init__("honba._core")
        self.config: dict = {}
        self.actions: list = []

    def run_backtest(self, config_json, candles, on_bar):
        self.config = json.loads(config_json)
        pos = dict.fromkeys(candles, 0.0)
        cash = self.config["initial_cash"]
        n = min(len(v) for v in candles.values())
        equity = []
        for i in range(n):
            bar_c = {
                s: dict(zip(("open", "high", "low", "close", "volume"), v[i][1:], strict=True))
                for s, v in candles.items()
            }
            acts = on_bar(
                {
                    "time_ms": next(iter(candles.values()))[i][0],
                    "candles": bar_c,
                    "positions": dict(pos),
                    "cash": cash,
                }
            )
            for a in acts:
                self.actions.append(a)
                sign = 1 if a["side"] == "buy" else -1
                pos[a["symbol"]] += sign * a["qty"]
                cash -= sign * a["qty"] * bar_c[a["symbol"]]["close"]
            equity.append(
                [
                    next(iter(candles.values()))[i][0],
                    cash + sum(pos[s] * bar_c[s]["close"] for s in pos),
                ]
            )
        return json.dumps(
            {
                "summary": {
                    "total_pnl": equity[-1][1] - self.config["initial_cash"],
                    "sharpe": 1.5,
                },
                "instruments": {},
                "trades": [{"time": equity[-1][0], "symbol": "X", "qty": 1}],
                "equity_curve": equity,
            }
        )


@pytest.fixture
def core(monkeypatch):
    fake = FakeCore()
    monkeypatch.setitem(sys.modules, "honba._core", fake)
    monkeypatch.setattr("honba._core", fake, raising=False)
    return fake


def _prices():
    closes = [100.0] * 5 + [90, 92, 95, 100, 110, 120, 130, 120, 100, 80, 60, 50, 40]
    return pd.DataFrame(
        {
            "time": pd.date_range("2024-01-01", periods=len(closes), freq="D"),
            "open": closes,
            "high": [c + 1 for c in closes],
            "low": [c - 1 for c in closes],
            "close": closes,
            "volume": [1000.0] * len(closes),
        }
    )


class Scripted(Strategy):
    params = {"qty": 5}  # noqa: RUF012

    def should_long(self):
        return self.index == 1

    def should_short(self):
        return self.index == 4

    def go_long(self):
        self.buy = self.params["qty"], self.close

    def go_short(self):
        self.sell = 3

    def update_position(self):
        if self.index == 3:
            self.liquidate()


def test_lifecycle_and_action_translation():
    ad = StrategyAdapter(Scripted, ["A"])
    pos = 0.0
    out = []
    for i in range(6):
        px = 100.0 + i
        acts = ad.on_bar(
            {
                "time_ms": i,
                "cash": 1e5,
                "positions": {"A": pos},
                "candles": {"A": {"open": px, "high": px, "low": px, "close": px, "volume": 1}},
            }
        )
        out.append(acts)
        for a in acts:
            pos += a["qty"] if a["side"] == "buy" else -a["qty"]
    assert out[1] == [{"symbol": "A", "side": "buy", "qty": 5.0}]
    assert out[3] == [{"symbol": "A", "side": "sell", "qty": 5.0}]  # liquidate long
    assert out[4] == [{"symbol": "A", "side": "sell", "qty": 3.0}]  # short entry
    assert ad.strategies["A"].candles.shape == (6, 6)


def test_pending_orders_not_stacked():
    class Always(Strategy):
        def should_long(self):
            return True

        def go_long(self):
            self.buy = 1

    ad = StrategyAdapter(Always, ["A"])
    bar = {
        "time_ms": 0,
        "cash": 0,
        "positions": {"A": 0.0},
        "candles": {"A": {"open": 1, "high": 1, "low": 1, "close": 1, "volume": 1}},
    }
    assert len(ad.on_bar(bar)) == 1
    assert ad.on_bar({**bar, "time_ms": 1}) == []  # still unfilled -> suppressed


def test_backtest_end_to_end(core):
    res = backtest(
        SmaCross,
        {"X": _prices()},
        initial_capital=50_000,
        fees_percent=0.1,
        latency_ms=5,
        params={"fast": 2, "slow": 4, "qty": 1},
    )
    assert core.config["symbols"] == ["X"] and core.config["exchange"] == "NSE"
    assert core.config["initial_cash"] == 50_000 and core.config["latency_ms"] == 5
    assert [a["side"] for a in core.actions][:2] == ["buy", "sell"]
    assert isinstance(res, BacktestResult)
    assert res.summary["sharpe"] == 1.5
    assert isinstance(res.trades, pd.DataFrame) and len(res.trades) == 1
    assert isinstance(res.equity_curve.index, pd.DatetimeIndex)
    assert res.raw["summary"]["total_pnl"] == res.summary["total_pnl"]


def test_polars_and_simple_callback(core):
    df = pl.from_pandas(_prices())

    def fn(ctx):
        if ctx.position("X") == 0 and ctx.closes("X")[-1] == 90:
            ctx.placeorder("X", "BUY", 2)

    res = backtest(fn, df, "X")
    assert core.actions == [{"symbol": "X", "side": "buy", "qty": 2.0}]
    assert res.equity_curve.iloc[-1] > 0


def test_sweep(core):
    df = sweep(
        SmaCross,
        {"X": _prices()},
        {"fast": [2, 3], "slow": [4, 5]},
        sort_by="total_pnl",
        params={"qty": 1},
    )
    assert len(df) == 4 and {"fast", "slow", "total_pnl"} <= set(df.columns)
    assert len(df.attrs["results"]) == 4


def test_data_validation(core):
    with pytest.raises(ValueError):
        backtest(SmaCross, _prices())  # no symbol
    with pytest.raises(ValueError):
        backtest(SmaCross, {"X": _prices().drop(columns="close")})


def test_missing_engine_message(monkeypatch):
    monkeypatch.setitem(sys.modules, "honba._core", None)
    with pytest.raises(RuntimeError, match="maturin"):
        backtest(SmaCross, {"X": _prices()})


def test_indicators():
    s = [1.0, 2, 3, 4, 5]
    assert indicators.sma(s, 5) == 3.0
    assert indicators.crossed_above([1, 3], [2, 2])
    assert indicators.rsi(list(range(1, 30)), 14) == 100.0
