"""Parameter optimisation (Optuna) and walk-forward analysis over declared :class:`Param` s.

``optimize`` searches the declared, bounded parameters of a strategy with Optuna (optional
dependency, ``pip install honba[ml]``), optionally holding out the tail of the data as an
out-of-sample test. ``walk_forward`` re-optimises on rolling (or anchored) train windows and
stitches the out-of-sample test windows into one equity curve. Both record the number of
configurations actually backtested so the result can report a Deflated Sharpe Ratio and a
CSCV Probability of Backtest Overfitting (:mod:`honba.research.overfit`).
"""

from __future__ import annotations

import math
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import date, datetime
from functools import cached_property
from typing import Any

import numpy as np
import pandas as pd

from honba.strategy.base import Strategy
from honba.strategy.params import Param
from honba.strategy.series import Bars

from .backtest import _check_param_names, _prepare, _run
from .config import BacktestConfig, _to_ms
from .engine import BacktestEngine
from .metrics import Metrics, compute_metrics, daily_returns
from .overfit import PBOResult, cscv_pbo, deflated_sharpe, return_moments
from .result import BacktestResult, _time_index

__all__ = [
    "OBJECTIVES",
    "OptimizationResult",
    "WalkForwardResult",
    "objective_value",
    "optimize",
    "walk_forward",
]

Objective = str | Callable[[BacktestResult], float]
Space = Mapping[str, Any] | Sequence[str] | None

OBJECTIVES = ("sharpe", "sortino", "calmar", "net_pnl", "omega", "serenity", "cagr")
_MINIMISE = {"max_drawdown", "ulcer_index", "annual_volatility", "longest_underwater_days"}


def _require_optuna() -> Any:
    try:
        import optuna
    except ImportError as exc:  # pragma: no cover - depends on the environment
        raise ImportError(
            "honba.optimize needs Optuna: pip install 'honba[ml]' (or pip install optuna)"
        ) from exc
    return optuna


# -- objective -------------------------------------------------------------------------------


def objective_value(result: BacktestResult, objective: Objective) -> float:
    """Score one backtest: a metric / summary name or a callable ``f(result) -> float``.

    Undefined values (no trades, zero variance) score ``nan`` (treated as the worst trial).
    """
    value = objective(result) if callable(objective) else result.metric(objective)
    if value is None:
        return float("nan")
    value = float(value)
    return value if math.isfinite(value) else float("nan")


def _direction(objective: Objective, direction: str | None) -> str:
    if direction is not None:
        if direction not in ("maximize", "minimize"):
            raise ValueError("direction must be 'maximize' or 'minimize'")
        return direction
    return "minimize" if isinstance(objective, str) and objective in _MINIMISE else "maximize"


def _check_objective(objective: Objective) -> None:
    if callable(objective):
        return
    names = set(Metrics.__dataclass_fields__) | {"net_pnl", "total_return", "final_equity"}
    if objective not in names:
        raise ValueError(
            f"objective {objective!r} is not a metric; use one of {OBJECTIVES}, "
            "any Metrics field, or a callable(result) -> float"
        )


# -- search space ----------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class _Dim:
    name: str
    kind: str  # "int" | "float" | "categorical"
    low: float | None = None
    high: float | None = None
    step: float | None = None
    choices: tuple[Any, ...] = ()


def _dim_from_param(name: str, p: Param) -> _Dim | None:
    if p.choices is not None:
        return _Dim(name, "categorical", choices=tuple(p.choices))
    if p.kind is bool:
        return _Dim(name, "categorical", choices=(False, True))
    if p.kind in (int, float) and p.low is not None and p.high is not None:
        if p.low == p.high:
            return None
        return _Dim(name, "int" if p.kind is int else "float", p.low, p.high, p.step)
    return None  # unbounded: stays at its default


def _search_space(strategy: type[Strategy], space: Space) -> list[_Dim]:
    declared = strategy.params()
    if space is None:
        dims = [_dim_from_param(n, p) for n, p in declared.items()]
        out = [d for d in dims if d is not None]
        if not out:
            raise ValueError(
                f"{strategy.__name__} declares no bounded Param to optimise "
                "(give low/high, choices or a bool default), or pass space="
            )
        return out
    names = list(space)
    unknown = set(names) - set(declared)
    if unknown:
        raise ValueError(
            f"space names undeclared parameters {sorted(unknown)}; declared {sorted(declared)}"
        )
    out = []
    for name in names:
        p = declared[name]
        spec = space[name] if isinstance(space, Mapping) else None
        if spec is None or isinstance(spec, Param):
            dim = _dim_from_param(name, spec or p)
            if dim is None:
                raise ValueError(f"parameter {name!r} has no bounds or choices to search")
        elif isinstance(spec, tuple) and len(spec) in (2, 3) and p.kind in (int, float):
            low, high, *step = spec
            p.validate(low)
            p.validate(high)
            dim = _Dim(name, "int" if p.kind is int else "float", low, high, *(step or [None]))
        else:
            values = tuple(p.validate(v) for v in spec)
            if not values:
                raise ValueError(f"space for {name!r} is empty")
            dim = _Dim(name, "categorical", choices=values)
        out.append(dim)
    return out


def _suggest(trial: Any, dim: _Dim) -> Any:
    if dim.kind == "categorical":
        return trial.suggest_categorical(dim.name, list(dim.choices))
    if dim.kind == "int":
        return trial.suggest_int(dim.name, int(dim.low), int(dim.high), step=int(dim.step or 1))
    return trial.suggest_float(dim.name, float(dim.low), float(dim.high), step=dim.step)


def _sampler(optuna: Any, sampler: Any, seed: int | None, dims: list[_Dim]) -> Any:
    if not isinstance(sampler, str):
        return sampler
    if sampler == "tpe":
        return optuna.samplers.TPESampler(seed=seed)
    if sampler == "random":
        return optuna.samplers.RandomSampler(seed=seed)
    if sampler == "grid":
        grid = {}
        for d in dims:
            if d.kind == "categorical":
                grid[d.name] = list(d.choices)
            else:
                p = Param(
                    float(d.low) if d.kind == "float" else int(d.low),  # type: ignore[arg-type]
                    low=d.low,
                    high=d.high,
                    step=d.step,
                )
                grid[d.name] = p.grid()
        return optuna.samplers.GridSampler(grid, seed=seed)
    raise ValueError(f"sampler must be tpe, random, grid or an optuna sampler, got {sampler!r}")


# -- candle windows --------------------------------------------------------------------------


def _timeline(candles: dict[str, Bars]) -> np.ndarray:
    return np.unique(np.concatenate([b.time_ms for b in candles.values()]))


def _window(candles: dict[str, Bars], lo: int | None, hi: int | None) -> dict[str, Bars]:
    """Bars with ``lo <= time_ms < hi`` per symbol (``None`` = open end)."""
    out = {}
    for sym, bars in candles.items():
        t = bars.time_ms
        i = 0 if lo is None else int(np.searchsorted(t, lo, "left"))
        j = len(t) if hi is None else int(np.searchsorted(t, hi, "left"))
        out[sym] = bars[i:j]
    return out


def _split_ms(times: np.ndarray, split: float | str | datetime | date | int) -> int:
    if isinstance(split, float) and 0 < split < 1:
        idx = int(len(times) * split)
        if not 0 < idx < len(times):
            raise ValueError(f"train fraction {split} leaves an empty train or test window")
        return int(times[idx])
    if isinstance(split, float):
        raise ValueError(f"train must be a fraction in (0, 1) or a split time, got {split}")
    ms = _to_ms(split)
    if not times[0] < ms <= times[-1]:
        raise ValueError("the train/test split time must fall inside the data")
    return ms


def _stitched_config(config: BacktestConfig, start_ms: int) -> BacktestConfig:
    start = start_ms if config.start_ms is None else max(start_ms, config.start_ms)
    return config.with_(start=start, warmup_bars=0)


# -- results ---------------------------------------------------------------------------------


@dataclass
class OptimizationResult:
    """Outcome of :func:`optimize`.

    ``best`` is the in-sample backtest of ``best_params`` and ``test`` its out-of-sample run
    (``None`` without a split). ``trials`` has one row per Optuna trial (parameters, value,
    state). ``n_trials`` counts distinct configurations actually backtested: the ``N`` of the
    deflated Sharpe ratio. ``study`` is the Optuna study.
    """

    best_params: dict[str, Any]
    best_value: float
    best: BacktestResult
    test: BacktestResult | None
    trials: pd.DataFrame
    n_trials: int
    objective: str
    direction: str
    split_ms: int | None
    study: Any = None
    trial_returns: pd.DataFrame = field(default_factory=pd.DataFrame, repr=False)
    objective_fn: Objective = field(default="sharpe", repr=False)

    @property
    def test_value(self) -> float | None:
        """Objective of ``best_params`` on the test window."""
        if self.test is None:
            return None
        return objective_value(self.test, self.objective_fn)

    @cached_property
    def deflated_sharpe(self) -> float:
        """DSR of the best configuration's in-sample daily returns, deflated by ``n_trials``.

        Uses the variance of the per-period Sharpe ratios of every distinct configuration tried.
        """
        rets = daily_returns(self.best.equity, self.best.config.capital)
        sharpes = [return_moments(self.trial_returns[c])[0] for c in self.trial_returns]
        return deflated_sharpe(rets, n_trials=self.n_trials, trial_sharpes=sharpes)

    def pbo(self, n_splits: int = 8) -> PBOResult:
        """CSCV probability of backtest overfitting over the daily returns of every trial."""
        return cscv_pbo(self.trial_returns.to_numpy(), n_splits=n_splits)

    def __repr__(self) -> str:
        test = "" if self.test is None else f", test={self.test_value}"
        return (
            f"OptimizationResult({self.objective}={self.best_value:.4g}{test}, "
            f"best_params={self.best_params}, n_trials={self.n_trials})"
        )


@dataclass
class WalkForwardResult:
    """Outcome of :func:`walk_forward`.

    ``folds`` has one row per fold (windows, best parameters, in- and out-of-sample objective);
    ``in_sample`` / ``out_of_sample`` the fold backtests. ``equity`` is the stitched
    out-of-sample equity: each test window compounds on the previous one's final equity.
    """

    folds: pd.DataFrame
    in_sample: list[BacktestResult]
    out_of_sample: list[BacktestResult]
    optimizations: list[OptimizationResult]
    capital: float
    objective: str
    config: BacktestConfig

    @cached_property
    def equity(self) -> pd.Series:
        """Stitched out-of-sample equity (IST time index)."""
        parts, level = [], self.capital
        for res in self.out_of_sample:
            eq = res.equity
            if eq.empty:
                continue
            parts.append(eq / res.config.capital * level)
            level = float(parts[-1].iloc[-1])
        if not parts:
            return pd.Series(dtype=float, name="equity", index=_time_index([]))
        return pd.concat(parts).rename("equity")

    @cached_property
    def metrics(self) -> Metrics:
        """Metrics of the stitched out-of-sample run."""
        trips = [t for res in self.out_of_sample for t in res.round_trips]
        return compute_metrics(
            trips,
            self.equity,
            self.capital,
            self.config.risk_free_return,
            self.config.trading_days_per_year,
        )

    @property
    def efficiency(self) -> float | None:
        """Walk-forward efficiency: mean out-of-sample / mean in-sample objective."""
        is_mean = float(np.nanmean(self.folds["is_value"])) if len(self.folds) else math.nan
        oos_mean = float(np.nanmean(self.folds["oos_value"])) if len(self.folds) else math.nan
        if not math.isfinite(is_mean) or not math.isfinite(oos_mean) or is_mean == 0:
            return None
        return oos_mean / is_mean

    @property
    def n_trials(self) -> int:
        """Configurations backtested over all folds."""
        return sum(o.n_trials for o in self.optimizations)

    def __repr__(self) -> str:
        eff = self.efficiency
        return (
            f"WalkForwardResult(folds={len(self.folds)}, objective={self.objective!r}, "
            f"oos_net_profit={self.metrics.net_profit:.2f}, "
            f"efficiency={'n/a' if eff is None else f'{eff:.2f}'})"
        )


# -- optimize --------------------------------------------------------------------------------


def _study(
    strategy: type[Strategy],
    candles: dict[str, Bars],
    config: BacktestConfig,
    *,
    dims: list[_Dim],
    fixed: Mapping[str, Any],
    objective: Objective,
    direction: str,
    n_trials: int,
    sampler: Any,
    seed: int | None,
    constraint: Callable[[dict[str, Any]], bool] | None,
    engine: str | BacktestEngine | None,
    timeout: float | None,
) -> tuple[Any, dict[tuple, tuple[BacktestResult, float]], list[dict[str, Any]]]:
    optuna = _require_optuna()
    cache: dict[tuple, tuple[BacktestResult, float]] = {}
    order: list[dict[str, Any]] = []
    worst = -math.inf if direction == "maximize" else math.inf

    def run_trial(trial: Any) -> float:
        combo = {**fixed, **{d.name: _suggest(trial, d) for d in dims}}
        if constraint is not None and not constraint(combo):
            trial.set_user_attr("infeasible", True)
            raise optuna.TrialPruned("constraint")
        key = tuple(sorted(combo.items(), key=lambda kv: kv[0]))
        if key not in cache:
            res = _run(strategy, candles, config, combo, engine)
            cache[key] = (res, objective_value(res, objective))
            order.append(combo)
        value = cache[key][1]
        trial.set_user_attr("raw_value", value)
        return worst if math.isnan(value) else value

    verbosity = optuna.logging.get_verbosity()
    optuna.logging.set_verbosity(optuna.logging.WARNING)
    try:
        study = optuna.create_study(
            direction=direction, sampler=_sampler(optuna, sampler, seed, dims)
        )
        study.optimize(run_trial, n_trials=n_trials, timeout=timeout)
    finally:
        optuna.logging.set_verbosity(verbosity)
    return study, cache, order


def optimize(
    strategy: type[Strategy],
    data: Any,
    config: BacktestConfig | None = None,
    *,
    space: Space = None,
    objective: Objective = "sharpe",
    direction: str | None = None,
    n_trials: int = 50,
    sampler: Any = "tpe",
    seed: int | None = None,
    train: float | str | datetime | date | int | None = None,
    constraint: Callable[[dict[str, Any]], bool] | None = None,
    symbols: Sequence[str] | str | None = None,
    params: Mapping[str, Any] | None = None,
    engine: str | BacktestEngine | None = None,
    timeout: float | None = None,
) -> OptimizationResult:
    """Search the strategy's declared parameters with Optuna.

    ``space`` defaults to every bounded :class:`Param` (``low``/``high``, ``choices`` or bool);
    a list of names restricts it, a mapping narrows it (``{"fast": (5, 20), "mode": ["a",
    "b"]}``; a tuple is a range, a list the choices; values are checked against the declared
    bounds). ``objective`` is ``"sharpe"`` (default), ``"sortino"``, ``"calmar"``,
    ``"net_pnl"``, any :class:`Metrics` field, or ``callable(result) -> float``; ``direction``
    defaults to maximise (minimise for drawdown-like metrics). ``sampler`` is ``"tpe"``,
    ``"random"``, ``"grid"`` or an Optuna sampler, seeded by ``seed``. ``train`` holds out a
    test window: a fraction of the bar timestamps (``0.7``) or a split time; the test backtest
    runs the best parameters over the whole data with the train bars as warm-up, so
    indicators are primed. ``constraint(params) -> bool`` skips infeasible combinations
    without running them. ``params`` fixes parameters outside the search.

    Trials run sequentially: strategy callbacks hold the GIL. Repeated suggestions of the same
    configuration are backtested once; ``n_trials`` on the result counts distinct backtests.
    """
    config = config or BacktestConfig()
    _check_objective(objective)
    if n_trials < 1:
        raise ValueError("n_trials must be >= 1")
    dims = _search_space(strategy, space)
    fixed = dict(params or {})
    _check_param_names(strategy, fixed)
    overlap = set(fixed) & {d.name for d in dims}
    if overlap:
        raise ValueError(f"parameters {sorted(overlap)} are both fixed (params=) and searched")
    candles = _prepare(strategy, data, config, symbols)
    return _optimize(
        strategy,
        candles,
        config,
        dims=dims,
        fixed=fixed,
        objective=objective,
        direction=_direction(objective, direction),
        n_trials=n_trials,
        sampler=sampler,
        seed=seed,
        train=train,
        constraint=constraint,
        engine=engine,
        timeout=timeout,
    )


def _optimize(
    strategy: type[Strategy],
    candles: dict[str, Bars],
    config: BacktestConfig,
    *,
    dims: list[_Dim],
    fixed: dict[str, Any],
    objective: Objective,
    direction: str,
    n_trials: int,
    sampler: Any,
    seed: int | None,
    train: float | str | datetime | date | int | None,
    constraint: Callable[[dict[str, Any]], bool] | None,
    engine: str | BacktestEngine | None,
    timeout: float | None,
) -> OptimizationResult:
    split = None
    train_candles = candles
    if train is not None:
        split = _split_ms(_timeline(candles), train)
        train_candles = _window(candles, None, split)
    study, cache, order = _study(
        strategy,
        train_candles,
        config,
        dims=dims,
        fixed=fixed,
        objective=objective,
        direction=direction,
        n_trials=n_trials,
        sampler=sampler,
        seed=seed,
        constraint=constraint,
        engine=engine,
        timeout=timeout,
    )
    if not cache:
        raise ValueError("no trial satisfied the constraint: nothing was backtested")
    best_key = _best_key(cache, direction)
    best_res, best_value = cache[best_key]
    best_params = dict(best_key)
    test = None
    if split is not None:
        test = _run(strategy, candles, _stitched_config(config, split), best_params, engine)
    returns = pd.DataFrame(
        {
            i: daily_returns(cache[tuple(sorted(c.items()))][0].equity, config.capital)
            for i, c in enumerate(order)
        }
    ).fillna(0.0)
    return OptimizationResult(
        best_params=best_params,
        best_value=best_value,
        best=best_res,
        test=test,
        trials=_trials_frame(study, [d.name for d in dims]),
        n_trials=len(cache),
        objective=objective if isinstance(objective, str) else _name(objective),
        direction=direction,
        split_ms=split,
        study=study,
        trial_returns=returns,
        objective_fn=objective,
    )


def _name(fn: Callable[..., Any]) -> str:
    return getattr(fn, "__name__", type(fn).__name__)


def _best_key(cache: dict[tuple, tuple[BacktestResult, float]], direction: str) -> tuple:
    def score(item: tuple[tuple, tuple[BacktestResult, float]]) -> float:
        value = item[1][1]
        if math.isnan(value):
            return -math.inf
        return value if direction == "maximize" else -value

    return max(cache.items(), key=score)[0]


def _trials_frame(study: Any, names: list[str]) -> pd.DataFrame:
    rows = []
    for t in study.trials:
        row = {"number": t.number, **{n: t.params.get(n) for n in names}}
        row["value"] = t.user_attrs.get("raw_value", t.value)
        row["state"] = "infeasible" if t.user_attrs.get("infeasible") else t.state.name.lower()
        rows.append(row)
    return pd.DataFrame(rows)


# -- walk forward ----------------------------------------------------------------------------


def walk_forward(
    strategy: type[Strategy],
    data: Any,
    config: BacktestConfig | None = None,
    *,
    train_bars: int,
    test_bars: int,
    step: int | None = None,
    anchored: bool = False,
    space: Space = None,
    objective: Objective = "sharpe",
    direction: str | None = None,
    n_trials: int = 30,
    sampler: Any = "tpe",
    seed: int | None = None,
    constraint: Callable[[dict[str, Any]], bool] | None = None,
    symbols: Sequence[str] | str | None = None,
    params: Mapping[str, Any] | None = None,
    engine: str | BacktestEngine | None = None,
) -> WalkForwardResult:
    """Walk-forward optimisation over bar-count windows.

    Fold ``k`` optimises on ``train_bars`` bar timestamps (from the start when ``anchored``)
    and tests the winner on the next ``test_bars``; windows advance by ``step`` (default
    ``test_bars``, i.e. non-overlapping tests). Test runs replay the train window as warm-up,
    so indicators are primed and no test bar is ever seen during its fold's optimisation.
    Other arguments are those of :func:`optimize`.
    """
    config = config or BacktestConfig()
    if train_bars < 2 or test_bars < 1:
        raise ValueError("train_bars must be >= 2 and test_bars >= 1")
    step = step or test_bars
    if step < 1:
        raise ValueError("step must be >= 1")
    _check_objective(objective)
    dims = _search_space(strategy, space)
    fixed = dict(params or {})
    _check_param_names(strategy, fixed)
    candles = _prepare(strategy, data, config, symbols)
    times = _timeline(candles)
    if train_bars + test_bars > len(times):
        raise ValueError(
            f"train_bars + test_bars = {train_bars + test_bars} exceeds the {len(times)} bars"
        )
    direction = _direction(objective, direction)
    rows, in_sample, oos, opts = [], [], [], []
    begin = 0
    fold = 0
    while begin + train_bars < len(times):
        train_lo = 0 if anchored else begin
        test_lo = begin + train_bars
        test_hi = min(test_lo + test_bars, len(times))
        hi_ms = None if test_hi == len(times) else int(times[test_hi])
        lo_ms, split_ms = int(times[train_lo]), int(times[test_lo])
        train_window = _window(candles, lo_ms, split_ms)
        opt = _optimize(
            strategy,
            train_window,
            config,
            dims=dims,
            fixed=fixed,
            objective=objective,
            direction=direction,
            n_trials=n_trials,
            sampler=sampler,
            seed=None if seed is None else seed + fold,
            train=None,
            constraint=constraint,
            engine=engine,
            timeout=None,
        )
        test = _run(
            strategy,
            _window(candles, lo_ms, hi_ms),
            _stitched_config(config, split_ms),
            opt.best_params,
            engine,
        )
        rows.append(
            {
                "fold": fold,
                "train_start": _time_index([lo_ms])[0],
                "test_start": _time_index([split_ms])[0],
                "test_end": _time_index([int(times[test_hi - 1])])[0],
                "train_bars": test_lo - train_lo,
                "test_bars": test_hi - test_lo,
                **{f"param_{k}": v for k, v in opt.best_params.items()},
                "is_value": opt.best_value,
                "oos_value": objective_value(test, objective),
                "oos_net_pnl": test.report.summary.net_pnl,
                "n_trials": opt.n_trials,
            }
        )
        in_sample.append(opt.best)
        oos.append(test)
        opts.append(opt)
        fold += 1
        begin += step
        if test_hi == len(times):
            break
    return WalkForwardResult(
        folds=pd.DataFrame(rows),
        in_sample=in_sample,
        out_of_sample=oos,
        optimizations=opts,
        capital=config.capital,
        objective=objective if isinstance(objective, str) else _name(objective),
        config=config,
    )
