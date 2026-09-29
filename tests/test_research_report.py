"""Tearsheet, JSON report and benchmark-relative metrics (J21)."""
# ruff: noqa: D101, D102, D103

from __future__ import annotations

import importlib.util
import json

import numpy as np
import pandas as pd
import pytest
from honba.research.report import SCHEMA, monthly_returns
from sdk_helpers import daily, flat, trending

import honba as hb

CFG = hb.BacktestConfig(capital=100_000.0)


class Hold(hb.Strategy):
    def on_bar(self, ctx):
        if len(self.history()) == 1:
            self.target(pct=0.5, tag="core")
            self.log("entered <core> & holding")


class Swing(hb.Strategy):
    def on_bar(self, ctx):
        n = len(self.history())
        if n % 10 == 1:
            self.target(pct=0.5)
        elif n % 10 == 6:
            self.close()


DATA = trending(260, seed=9, drift=0.05)


def _bench(frame: pd.DataFrame) -> pd.Series:
    return pd.Series(frame.close.to_numpy(), index=pd.DatetimeIndex(frame.time))


def test_monthly_returns_compound_from_capital():
    idx = pd.DatetimeIndex(
        ["2024-01-10", "2024-01-31", "2024-02-15", "2024-03-29"], tz="Asia/Kolkata"
    )
    eq = pd.Series([101.0, 110.0, 99.0, 108.9], index=idx)
    table = monthly_returns(eq, 100.0)
    assert table.loc[2024, 1] == pytest.approx(0.10)
    assert table.loc[2024, 2] == pytest.approx(-0.10)
    assert table.loc[2024, 3] == pytest.approx(0.10)
    assert np.isnan(table.loc[2024, 4])
    assert table.loc[2024, "year"] == pytest.approx(0.089)


def test_benchmark_metrics_against_itself_and_the_underlying():
    res = hb.backtest(Hold, {"X": DATA}, CFG, engine="simple")
    own = res.benchmark_metrics(res.equity)
    assert own["beta"] == pytest.approx(1.0) and own["alpha"] == pytest.approx(0.0, abs=1e-12)
    assert own["correlation"] == pytest.approx(1.0)
    assert own["tracking_error"] is None and own["information_ratio"] is None
    vs = res.benchmark_metrics(_bench(DATA))
    assert vs["n_days"] == len(DATA) - 1
    assert 0.3 < vs["beta"] < 0.7  # half the capital in the stock
    assert vs["correlation"] > 0.99
    assert vs["benchmark_return"] == pytest.approx(DATA.close.iloc[-1] / DATA.close.iloc[0] - 1)
    assert vs["excess_return"] == pytest.approx(vs["strategy_return"] - vs["benchmark_return"])
    frame = DATA[["time", "close"]]
    assert res.benchmark_metrics(frame)["beta"] == pytest.approx(vs["beta"])
    with pytest.raises(TypeError):
        res.benchmark_metrics([1, 2, 3])


@pytest.mark.parametrize("engine", ["simple", "barter"])
def test_to_json_is_strict_json_with_the_documented_keys(engine, tmp_path):
    if engine == "barter":
        pytest.importorskip("honba._core")
    res = hb.backtest(Swing, {"X": DATA}, CFG, engine=engine)
    path = tmp_path / "r.json"
    text = res.to_json(path, benchmark=_bench(DATA), include_fills=True)
    assert path.read_text() == text
    doc = json.loads(text)
    assert doc["schema"] == SCHEMA and doc["engine"] == engine
    for key in ("summary", "metrics", "equity", "monthly_returns", "trades", "logs", "fills"):
        assert key in doc
    assert len(doc["equity"]) == len(res.equity)
    assert doc["equity"][-1]["equity"] == pytest.approx(res.equity.iloc[-1])
    assert len(doc["trades"]) == len(res.round_trips)
    assert isinstance(doc["metrics"]["avg_holding"], float)  # timedelta -> seconds
    assert doc["benchmark"]["n_days"] > 0


def test_to_json_without_trades_uses_null_for_undefined_values():
    class Idle(hb.Strategy):
        def on_bar(self, ctx):
            pass

    res = hb.backtest(Idle, {"X": daily(flat(100, 5))}, CFG, engine="simple")
    doc = json.loads(res.to_json())
    assert doc["trades"] == [] and doc["metrics"]["sharpe"] is None


def test_svg_tearsheet_is_self_contained_and_escapes_text(tmp_path):
    res = hb.backtest(Hold, {"X": DATA}, CFG, engine="simple")
    path = tmp_path / "t.html"
    html = res.tearsheet(path, benchmark=_bench(DATA), benchmark_name="NIFTY", charts="svg")
    assert path.read_text() == html
    assert html.startswith("<!doctype html>") and html.count("<svg") == 2
    assert "Monthly returns" in html and "Versus NIFTY" in html and "Trade list" in html
    assert "entered &lt;core&gt; &amp; holding" in html  # log lines are escaped
    assert "<script src" not in html and "http" not in html.split("<main>")[1].split("NIFTY")[0]
    assert "prefers-color-scheme: dark" in html


@pytest.mark.skipif(importlib.util.find_spec("plotly") is None, reason="plotly not installed")
def test_plotly_tearsheet_inlines_the_library():
    res = hb.backtest(Swing, {"X": DATA}, CFG, engine="simple")
    html = res.tearsheet(charts="plotly")
    assert "Plotly.newPlot" in html and "cdn.plot.ly" not in html.split("Plotly.newPlot")[0][-2000:]
    assert html.count("<svg") == 0 or "plotly" in html


def test_tearsheet_rejects_unknown_chart_mode():
    res = hb.backtest(Swing, {"X": DATA}, CFG, engine="simple")
    with pytest.raises(ValueError, match="charts"):
        res.tearsheet(charts="png")
