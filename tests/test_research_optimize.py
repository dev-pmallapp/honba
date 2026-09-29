"""Optimisation (Optuna), walk-forward and the DSR / PBO wrappers (J16)."""
# ruff: noqa: D103

from __future__ import annotations

import importlib.util
import sys

import numpy as np
import pandas as pd
import pytest
from sdk_helpers import SmaCross, trending

import honba as hb
from honba.research import overfit

CFG = hb.BacktestConfig(capital=100_000.0)
DATA = {"X": trending(260, seed=3)}


def _has_core() -> bool:
    try:
        from honba.research._barter_adapter import OverfitCore

        OverfitCore()
    except (ImportError, RuntimeError):
        return False
    return True


needs_core = pytest.mark.skipif(not _has_core(), reason="honba._core not built")
needs_optuna = pytest.mark.skipif(
    importlib.util.find_spec("optuna") is None, reason="optuna not installed (honba[ml])"
)


# ---------------------------------------------------------------------------- overfit wrapper


def test_pbo_single_split_matches_the_rust_definition():
    assert overfit.pbo([1, 2, 3], [3, 2, 1], backend="python") == 1.0
    assert overfit.pbo([1, 2, 3], [1, 2, 3], backend="python") == pytest.approx(1 / 3)
    assert overfit.pbo([], [], backend="python") == 1.0


def test_dsr_edge_cases_and_validation():
    assert overfit.dsr(0.1, 1, 0.0, 250, backend="python") == 1.0  # no selection
    high = overfit.dsr(0.2, 10, 0.001, 500, backend="python")
    low = overfit.dsr(0.2, 1000, 0.01, 500, backend="python")
    assert 0.0 <= low < high <= 1.0  # more / wider trials deflate harder
    with pytest.raises(ValueError, match="trial_sharpes or var_trials"):
        overfit.deflated_sharpe(np.ones(10), n_trials=5)
    with pytest.raises(ValueError, match="n_obs"):
        overfit.dsr(0.1, 3, 0.1, 0)


@needs_core
def test_rust_and_python_backends_agree():
    rng = np.random.default_rng(0)
    r = rng.normal(0.001, 0.01, 400)
    for n, var in ((2, 0.0), (20, 0.002), (500, 0.02)):
        core = overfit.deflated_sharpe(r, n_trials=n, var_trials=var, backend="core")
        py = overfit.deflated_sharpe(r, n_trials=n, var_trials=var, backend="python")
        assert core == pytest.approx(py, abs=1e-6)
    is_perf, oos_perf = rng.normal(size=12), rng.normal(size=12)
    assert overfit.pbo(is_perf, oos_perf, backend="core") == overfit.pbo(
        is_perf, oos_perf, backend="python"
    )
    mat = rng.normal(0, 0.01, (320, 9))
    assert overfit.cscv_pbo(mat, backend="core").pbo == overfit.cscv_pbo(mat, backend="python").pbo
    assert overfit.overfit_backend().name == "core"


def test_cscv_pbo_detects_skill_and_noise():
    rng = np.random.default_rng(1)
    noise = rng.normal(0, 0.01, (400, 12))
    skilled = noise.copy()
    skilled[:, 3] += 0.01  # one configuration is genuinely better everywhere
    assert overfit.cscv_pbo(skilled).pbo == 0.0
    pbos = [overfit.cscv_pbo(rng.normal(0, 0.01, (400, 12))).pbo for _ in range(12)]
    assert 0.25 < float(np.mean(pbos)) < 0.75  # pure noise: coin flip on average
    res = overfit.cscv_pbo(noise, n_splits=6)
    assert res.n_combinations == 20 and len(res.logits) == 20 and res.n_trials == 12
    with pytest.raises(ValueError, match="even"):
        overfit.cscv_pbo(noise, n_splits=5)
    with pytest.raises(ValueError, match="T x N"):
        overfit.cscv_pbo(noise[:, :1])


# ---------------------------------------------------------------------------- optimize


@needs_optuna
def test_optimize_respects_bounds_constraint_and_counts_trials():
    res = hb.optimize(
        SmaCross,
        DATA,
        CFG,
        n_trials=25,
        seed=7,
        engine="simple",
        constraint=lambda p: p["fast"] < p["slow"],
    )
    done = res.trials[res.trials.state == "complete"]
    assert done.fast.between(2, 20).all() and done.slow.between(10, 60).all()
    assert (done.fast < done.slow).all()
    infeasible = res.trials[res.trials.state == "infeasible"]
    assert (infeasible.fast >= infeasible.slow).all()
    distinct = done[["fast", "slow"]].drop_duplicates()
    assert res.n_trials == len(distinct) == res.trial_returns.shape[1]
    assert res.best_value == pytest.approx(done.value.max())
    assert res.best.params == res.best_params
    assert np.isfinite(res.deflated_sharpe) and 0 <= res.deflated_sharpe <= 1
    assert 0.0 <= res.pbo().pbo <= 1.0


@needs_optuna
def test_optimize_is_reproducible_with_a_seed():
    a = hb.optimize(SmaCross, DATA, CFG, n_trials=10, seed=3, engine="simple")
    b = hb.optimize(SmaCross, DATA, CFG, n_trials=10, seed=3, engine="simple")
    assert a.trials[["fast", "slow", "value"]].equals(b.trials[["fast", "slow", "value"]])


@needs_optuna
def test_optimize_space_objectives_and_grid_sampler():
    res = hb.optimize(
        SmaCross,
        DATA,
        CFG,
        space={"fast": [3, 5], "slow": (20, 30, 5)},
        objective="net_pnl",
        sampler="grid",
        n_trials=100,
        engine="simple",
    )
    assert res.n_trials == 6  # 2 x 3 grid, exhausted before n_trials
    assert set(res.trials.fast) == {3, 5} and set(res.trials.slow) == {20, 25, 30}
    assert res.best_value == pytest.approx(res.best.summary["net_pnl"])

    only_fast = hb.optimize(
        SmaCross, DATA, CFG, space=["fast"], params={"slow": 30}, n_trials=5, seed=1,
        engine="simple",
    )  # fmt: skip
    assert only_fast.best_params["slow"] == 30 and "slow" not in only_fast.trials

    trades = hb.optimize(
        SmaCross, DATA, CFG, space={"fast": [3, 5]}, n_trials=4, seed=1, engine="simple",
        objective=lambda r: -r.metrics.total_trades, direction="maximize",
    )  # fmt: skip
    assert trades.objective == "<lambda>"
    dd = hb.optimize(
        SmaCross, DATA, CFG, space={"fast": [3, 5]}, objective="max_drawdown", n_trials=4,
        engine="simple",
    )  # fmt: skip
    assert dd.direction == "minimize"


@needs_optuna
def test_optimize_rejects_bad_input():
    with pytest.raises(ValueError, match="undeclared"):
        hb.optimize(SmaCross, DATA, space=["nope"], engine="simple")
    with pytest.raises(ValueError, match="below low"):
        hb.optimize(SmaCross, DATA, space={"fast": (1, 5)}, engine="simple")
    with pytest.raises(ValueError, match="not a metric"):
        hb.optimize(SmaCross, DATA, objective="shrape", engine="simple")
    with pytest.raises(ValueError, match="both fixed"):
        hb.optimize(SmaCross, DATA, params={"fast": 5}, engine="simple")
    with pytest.raises(ValueError, match="nothing was backtested"):
        hb.optimize(SmaCross, DATA, n_trials=3, constraint=lambda p: False, engine="simple")

    class NoParams(hb.Strategy):
        free = hb.Param(3)  # unbounded

        def on_bar(self, ctx):
            pass

    with pytest.raises(ValueError, match="no bounded Param"):
        hb.optimize(NoParams, DATA, engine="simple")


def test_optimize_without_optuna_raises_a_clear_error(monkeypatch):
    monkeypatch.setitem(sys.modules, "optuna", None)
    with pytest.raises(ImportError, match=r"honba\[ml\]"):
        hb.optimize(SmaCross, DATA, n_trials=2, engine="simple")


@needs_optuna
def test_train_test_split_runs_the_best_params_out_of_sample():
    res = hb.optimize(SmaCross, DATA, CFG, n_trials=8, seed=2, train=0.6, engine="simple")
    times = pd.DatetimeIndex(DATA["X"].time)
    split = pd.Timestamp(times[int(len(times) * 0.6)], tz="Asia/Kolkata")
    assert res.best.equity.index.max() < split  # optimisation never saw the test window
    assert res.test is not None and res.test.equity.index.min() >= split
    assert res.test.params == res.best_params
    direct = hb.backtest(
        SmaCross, DATA, CFG.with_(start=res.split_ms), params=res.best_params, engine="simple"
    )
    assert res.test.summary["net_pnl"] == pytest.approx(direct.summary["net_pnl"])
    assert res.test_value == pytest.approx(direct.metrics.sharpe)
    by_date = hb.optimize(
        SmaCross, DATA, CFG, n_trials=2, seed=2, train="2024-09-02", engine="simple"
    )
    assert by_date.test.equity.index.min() >= pd.Timestamp("2024-09-02", tz="Asia/Kolkata")
    with pytest.raises(ValueError, match="fraction"):
        hb.optimize(SmaCross, DATA, train=1.5, engine="simple")


@needs_core
@needs_optuna
def test_optimize_on_the_barter_engine_matches_a_direct_backtest():
    res = hb.optimize(SmaCross, DATA, CFG, n_trials=6, seed=5, engine="barter", train=0.7)
    assert res.best.engine == "barter" and res.test.engine == "barter"
    # the in-sample run used only the train window: same params on it must agree exactly
    train = {"X": DATA["X"].iloc[: int(len(DATA["X"]) * 0.7)]}
    again = hb.backtest(SmaCross, train, CFG, params=res.best_params)
    assert res.best.summary["net_pnl"] == pytest.approx(again.summary["net_pnl"])
    assert res.best.fills[["side", "qty", "price"]].equals(again.fills[["side", "qty", "price"]])
    oos = hb.backtest(SmaCross, DATA, CFG.with_(start=res.split_ms), params=res.best_params)
    assert res.test.summary["net_pnl"] == pytest.approx(oos.summary["net_pnl"])


# ---------------------------------------------------------------------------- walk forward


def _check_folds(wf, n_bars, train_bars, test_bars):
    folds = wf.folds
    assert (folds.test_start > folds.train_start).all()
    assert (folds.test_bars <= test_bars).all()
    # test windows are contiguous and non-overlapping (step = test_bars)
    assert (folds.test_start.iloc[1:].to_numpy() > folds.test_end.iloc[:-1].to_numpy()).all()
    for is_res, oos_res, (_, row) in zip(
        wf.in_sample, wf.out_of_sample, folds.iterrows(), strict=True
    ):
        assert is_res.equity.index.max() < row.test_start  # no test bar in its optimisation
        assert oos_res.equity.index.min() >= row.test_start
        assert oos_res.equity.index.max() <= row.test_end
    assert wf.equity.index.is_monotonic_increasing
    assert len(wf.equity) == folds.test_bars.sum()


@needs_optuna
def test_walk_forward_rolling_and_anchored_windows():
    wf = hb.walk_forward(
        SmaCross, DATA, CFG, train_bars=100, test_bars=40, n_trials=5, seed=1, engine="simple"
    )
    assert len(wf.folds) == 4  # 100 + 4*40 = 260
    assert (wf.folds.train_bars == 100).all()
    _check_folds(wf, 260, 100, 40)
    assert wf.n_trials == wf.folds.n_trials.sum()
    # stitching compounds: final stitched equity = capital x product of fold growth
    growth = np.prod([r.equity.iloc[-1] / r.config.capital for r in wf.out_of_sample])
    assert wf.equity.iloc[-1] == pytest.approx(CFG.capital * growth)
    assert wf.metrics.net_profit == pytest.approx(wf.equity.iloc[-1] - CFG.capital)
    assert "WalkForwardResult(folds=4" in repr(wf)

    anchored = hb.walk_forward(
        SmaCross, DATA, CFG, train_bars=100, test_bars=80, anchored=True, n_trials=3, seed=1,
        engine="simple",
    )  # fmt: skip
    assert anchored.folds.train_bars.tolist() == [100, 180]
    assert anchored.folds.test_bars.tolist() == [80, 80]
    with pytest.raises(ValueError, match="exceeds"):
        hb.walk_forward(SmaCross, DATA, train_bars=250, test_bars=20, engine="simple")


def test_walk_forward_rejects_overlapping_test_windows():
    for step in (0, 1, 39):
        with pytest.raises(ValueError, match=r"step \(\d+\) must be >= test_bars"):
            hb.walk_forward(
                SmaCross, DATA, CFG, train_bars=100, test_bars=40, step=step, engine="simple"
            )


@needs_optuna
def test_walk_forward_step_beyond_test_bars_leaves_gaps_without_overlap():
    wf = hb.walk_forward(
        SmaCross, DATA, CFG, train_bars=100, test_bars=30, step=50, n_trials=3, seed=1,
        engine="simple",
    )  # fmt: skip
    _check_folds(wf, 260, 100, 30)
    assert wf.equity.index.is_unique


@needs_core
@needs_optuna
def test_walk_forward_on_the_barter_engine():
    wf = hb.walk_forward(
        SmaCross, DATA, CFG, train_bars=120, test_bars=70, n_trials=4, seed=2, engine="barter"
    )
    _check_folds(wf, 260, 120, 70)
    for oos, (_, row) in zip(wf.out_of_sample, wf.folds.iterrows(), strict=True):
        assert oos.engine == "barter"
        params = {k.removeprefix("param_"): v for k, v in row.items() if k.startswith("param_")}
        assert oos.params == params
