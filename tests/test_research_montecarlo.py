"""Monte Carlo on trades (J17): shuffle / resample / block, ruin, percentiles."""
# ruff: noqa: D103

from __future__ import annotations

import numpy as np
import pytest
from honba.research.montecarlo import monte_carlo_trades
from sdk_helpers import SmaCross, trending

import honba as hb

PNL = [100.0, -50.0, 80.0, -120.0, 60.0, -30.0, 90.0, -70.0, 40.0, 20.0]


def _max_dd(pnl, capital):
    eq = np.concatenate(([capital], capital + np.cumsum(pnl)))
    peak = np.maximum.accumulate(eq)
    return float((1 - eq / peak).max())


def test_shuffle_keeps_the_final_pnl_and_varies_the_drawdown():
    mc = monte_carlo_trades(PNL, 1_000.0, n=500, method="shuffle", seed=1, keep_paths=True)
    assert np.allclose(mc.final_equity, 1_000.0 + sum(PNL))
    assert mc.original["max_drawdown"] == pytest.approx(_max_dd(PNL, 1_000.0))
    assert mc.max_drawdown.std() > 0
    # every path is a permutation: its drawdown recomputed by hand matches
    for path, dd in zip(mc.paths[:20], mc.max_drawdown[:20], strict=True):
        assert _max_dd(np.diff(path), 1_000.0) == pytest.approx(dd)
        assert sorted(np.round(np.diff(path), 9)) == sorted(PNL)
    assert mc.paths.shape == (500, len(PNL) + 1)


def test_resample_and_block_bootstrap_draw_from_the_trades():
    boot = monte_carlo_trades(PNL, 1_000.0, n=300, method="resample", seed=2, keep_paths=True)
    steps = np.round(np.diff(boot.paths, axis=1), 9)
    assert set(np.unique(steps)) <= set(PNL)
    assert boot.total_return.std() > 0  # unlike shuffle, the final PnL varies
    blk = monte_carlo_trades(PNL, 1_000.0, n=200, method="block", block=3, seed=3, keep_paths=True)
    steps = np.round(np.diff(blk.paths, axis=1), 9)
    runs = {tuple(PNL[i : i + 3]) for i in range(len(PNL) - 2)}
    for row in steps:
        assert tuple(row[:3]) in runs and tuple(row[3:6]) in runs  # whole blocks of trades


def test_ruin_probability_percentiles_and_reproducibility():
    losing = [-100.0] * 6 + [50.0] * 4  # net -400 on 1000: a 40% loss at the end
    mc = monte_carlo_trades(
        losing, 1_000.0, n=400, method="shuffle", ruin=0.5, seed=4, keep_paths=True
    )
    by_hand = (mc.paths.min(axis=1) <= 500.0).mean()
    assert mc.ruin_probability == pytest.approx(by_hand)
    assert 0.0 < mc.ruin_probability < 1.0
    never = monte_carlo_trades(losing, 1_000.0, n=400, method="shuffle", ruin=0.7, seed=4)
    assert never.ruin_probability == 0.0  # the deepest possible trough is -600 (losses first)
    deep = monte_carlo_trades(losing, 1_000.0, n=400, method="shuffle", ruin=0.4, seed=4)
    assert deep.ruin_probability == 1.0  # -400 is always reached at the end
    assert (
        0.0
        < monte_carlo_trades(
            losing, 1_000.0, n=2_000, method="resample", ruin=0.5, seed=4
        ).ruin_probability
        < 1.0
    )
    pct = mc.percentiles()
    assert list(pct.columns) == ["p5", "p25", "p50", "p75", "p95"]
    assert pct.loc["max_drawdown"].is_monotonic_increasing
    assert mc.drawdown_probability(0.0) == 1.0
    again = monte_carlo_trades(losing, 1_000.0, n=400, method="shuffle", ruin=0.5, seed=4)
    assert np.array_equal(mc.max_drawdown, again.max_drawdown)
    summary = mc.summary()
    assert summary["percentiles"]["max_drawdown"]["p50"] == pytest.approx(
        pct.loc["max_drawdown", "p50"]
    )
    assert len(mc.to_frame()) == 400


def test_validation_and_no_trades():
    with pytest.raises(ValueError, match="method"):
        monte_carlo_trades(PNL, 1_000.0, method="jackknife")
    with pytest.raises(ValueError, match="ruin"):
        monte_carlo_trades(PNL, 1_000.0, ruin=0)
    empty = monte_carlo_trades([], 1_000.0, n=10)
    assert empty.n_trades == 0 and empty.ruin_probability == 0.0
    assert (empty.final_equity == 1_000.0).all() and "no trades" in repr(empty)


def test_result_monte_carlo_uses_the_net_round_trips():
    res = hb.backtest(
        SmaCross, {"X": trending(200, seed=5)}, hb.BacktestConfig(capital=10_000.0),
        engine="simple",
    )  # fmt: skip
    assert res.round_trips
    mc = res.monte_carlo(n=200, method="resample", seed=1)
    assert mc.n_trades == len(res.round_trips) and mc.capital == 10_000.0
    net = sum(t.pnl for t in res.round_trips)
    assert mc.original["final_equity"] == pytest.approx(10_000.0 + net)
    assert "MonteCarloResult(resample" in repr(mc)
