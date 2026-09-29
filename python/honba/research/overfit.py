"""Anti-overfitting statistics: Deflated Sharpe Ratio and Probability of Backtest Overfitting.

The maths lives in the Rust ``honba-overfit`` crate and is reached through the engine adapter
(``honba.research._barter_adapter:OverfitCore``, resolved lazily by name, like the engine
registry), so this module stays engine-neutral. When the compiled extension is not built a
pure-numpy implementation of the same formulas is used; :func:`overfit_backend` tells which.

- :func:`dsr` / :func:`deflated_sharpe`: probability that the observed Sharpe ratio beats the
  expected maximum Sharpe of ``n_trials`` unskilled trials (Bailey & Lopez de Prado, 2014),
  corrected for the skewness / kurtosis of the returns. Sharpe ratios are per period
  (daily, not annualised).
- :func:`pbo` (one IS / OOS split) and :func:`cscv_pbo` (combinatorially symmetric
  cross-validation over a ``T x N`` matrix of trial returns): the probability that the best
  in-sample configuration ranks below the median out of sample.
"""

from __future__ import annotations

import importlib
import itertools
import math
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from typing import Any, Protocol

import numpy as np

__all__ = [
    "PBOResult",
    "cscv_pbo",
    "deflated_sharpe",
    "dsr",
    "overfit_backend",
    "pbo",
    "return_moments",
]

# Resolved by name (no static import): only the adapter may touch the compiled engine.
_CORE_BACKEND = "honba.research._barter_adapter:OverfitCore"
_EULER_MASCHERONI = 0.5772156649


class OverfitBackend(Protocol):
    """What a DSR / PBO implementation provides."""

    name: str

    def dsr(
        self,
        observed_sharpe: float,
        n_trials: int,
        var_trials: float,
        n_obs: int,
        skew: float,
        kurtosis: float,
    ) -> float:
        """Deflated Sharpe Ratio (a probability)."""
        ...

    def pbo(self, is_perf: Sequence[float], oos_perf: Sequence[float]) -> float:
        """``1 - percentile`` of the best in-sample configuration out of sample."""
        ...


class PythonOverfit:
    """Pure-numpy twin of the Rust ``AntiOverfitEngine`` (same formulas, same edge cases)."""

    name = "python"

    def dsr(
        self,
        observed_sharpe: float,
        n_trials: int,
        var_trials: float,
        n_obs: int,
        skew: float,
        kurtosis: float,
    ) -> float:
        """Deflated Sharpe Ratio (a probability)."""
        if n_trials <= 1:
            return 1.0
        z = math.sqrt(2.0 * math.log(n_trials))
        expected_max = math.sqrt(var_trials) * (z + _EULER_MASCHERONI / z)
        denom = (1.0 - skew * observed_sharpe + (kurtosis - 1.0) / 4.0 * observed_sharpe**2) / n_obs
        if denom <= 0.0:
            return 0.5
        score = (observed_sharpe - expected_max) / math.sqrt(denom)
        return 0.5 * (1.0 + math.erf(score / math.sqrt(2.0)))

    def pbo(self, is_perf: Sequence[float], oos_perf: Sequence[float]) -> float:
        """``1 - percentile`` of the best in-sample configuration out of sample."""
        if not len(is_perf) or len(is_perf) != len(oos_perf):
            return 1.0
        best = int(np.argmax(np.asarray(is_perf, dtype=float)))
        oos = np.asarray(oos_perf, dtype=float)
        return 1.0 - float((oos < oos[best]).sum()) / len(oos)


_backends: dict[str, OverfitBackend] = {}


def overfit_backend(name: str = "auto") -> OverfitBackend:
    """The DSR / PBO implementation: ``"core"`` (Rust), ``"python"`` or ``"auto"``.

    ``auto`` prefers the compiled Rust implementation and falls back to Python when the
    extension is not built.
    """
    if name not in ("auto", "core", "python"):
        raise ValueError(f"backend must be auto, core or python, got {name!r}")
    if name == "python":
        return _backends.setdefault("python", PythonOverfit())
    if "core" not in _backends:
        module, _, attr = _CORE_BACKEND.partition(":")
        try:
            _backends["core"] = getattr(importlib.import_module(module), attr)()
        except (ImportError, RuntimeError):
            if name == "core":
                raise
            return overfit_backend("python")
    return _backends["core"]


def return_moments(returns: Sequence[float] | np.ndarray) -> tuple[float, float, float, int]:
    """Per-period Sharpe ratio, skewness and (Pearson, non-excess) kurtosis of ``returns``.

    Returns ``(sharpe, skew, kurtosis, n)``; zero-variance or too-short series give a Sharpe of
    0, skewness 0 and kurtosis 3 (normal).
    """
    r = np.asarray(returns, dtype=float)
    r = r[np.isfinite(r)]
    n = len(r)
    if n < 2:
        return 0.0, 0.0, 3.0, n
    sd = float(r.std(ddof=1))
    if sd <= 0:
        return 0.0, 0.0, 3.0, n
    centred = r - r.mean()
    m2 = float(np.mean(centred**2))
    skew = float(np.mean(centred**3)) / m2**1.5
    kurt = float(np.mean(centred**4)) / m2**2
    return float(r.mean()) / sd, skew, kurt, n


def dsr(
    observed_sharpe: float,
    n_trials: int,
    var_trials: float,
    n_obs: int,
    skew: float = 0.0,
    kurtosis: float = 3.0,
    *,
    backend: str = "auto",
) -> float:
    """Deflated Sharpe Ratio from its inputs (per-period Sharpe, Pearson kurtosis).

    ``var_trials`` is the variance of the per-period Sharpe ratios across the ``n_trials``
    configurations tested; ``n_obs`` the number of returns behind ``observed_sharpe``.
    """
    if n_obs < 1:
        raise ValueError("n_obs must be >= 1")
    return float(
        overfit_backend(backend).dsr(
            float(observed_sharpe),
            int(n_trials),
            max(float(var_trials), 0.0),
            int(n_obs),
            float(skew),
            float(kurtosis),
        )
    )


def deflated_sharpe(
    returns: Sequence[float] | np.ndarray,
    *,
    n_trials: int,
    trial_sharpes: Sequence[float] | np.ndarray | None = None,
    var_trials: float | None = None,
    backend: str = "auto",
) -> float:
    """Deflated Sharpe Ratio of the selected configuration's per-period ``returns``.

    Give ``trial_sharpes`` (per-period Sharpe of every configuration tried) or their variance
    ``var_trials``. With ``n_trials <= 1`` there was no selection and the result is 1.
    """
    sharpe, skew, kurt, n = return_moments(returns)
    if var_trials is None:
        if trial_sharpes is not None and len(trial_sharpes) > 1:
            var_trials = float(np.var(np.asarray(trial_sharpes, dtype=float), ddof=1))
        elif n_trials > 1:
            raise ValueError("deflated_sharpe needs trial_sharpes or var_trials when n_trials > 1")
        else:
            var_trials = 0.0
    if n < 2:
        return float("nan")
    return dsr(sharpe, n_trials, var_trials, n, skew, kurt, backend=backend)


def pbo(
    is_perf: Sequence[float] | np.ndarray,
    oos_perf: Sequence[float] | np.ndarray,
    *,
    backend: str = "auto",
) -> float:
    """One-split overfitting score: ``1 - OOS percentile`` of the best in-sample config.

    ``is_perf[i]`` / ``oos_perf[i]`` are the in- and out-of-sample performance of
    configuration ``i``. 0 means the in-sample winner is also the out-of-sample winner.
    """
    return float(
        overfit_backend(backend).pbo([float(x) for x in is_perf], [float(x) for x in oos_perf])
    )


@dataclass(frozen=True, slots=True)
class PBOResult:
    """Outcome of :func:`cscv_pbo`.

    ``pbo`` is the share of splits whose in-sample winner ranks at or below the out-of-sample
    median (logit <= 0); ``logits`` holds one value per split.
    """

    pbo: float
    logits: np.ndarray = field(repr=False)
    n_splits: int
    n_combinations: int
    n_trials: int
    backend: str

    def __float__(self) -> float:
        return self.pbo


def _sharpe_cols(block: np.ndarray) -> np.ndarray:
    sd = block.std(axis=0, ddof=1)
    mean = block.mean(axis=0)
    with np.errstate(divide="ignore", invalid="ignore"):
        out = np.where(sd > 0, mean / np.where(sd > 0, sd, 1.0), 0.0)
    return out


def cscv_pbo(
    returns: Any,
    *,
    n_splits: int = 8,
    metric: Callable[[np.ndarray], np.ndarray] | None = None,
    backend: str = "auto",
) -> PBOResult:
    """Probability of Backtest Overfitting by combinatorially symmetric cross-validation.

    ``returns`` is a ``T x N`` matrix (array or DataFrame): per-period returns of ``N``
    configurations over the same ``T`` periods. Rows are cut into ``n_splits`` (even)
    contiguous blocks; every half of the blocks is in sample once, the rest out of sample.
    ``metric`` maps a ``t x N`` block to ``N`` scores (default: per-period Sharpe). Each split
    is scored by :func:`pbo` (Rust when built).
    """
    mat = np.asarray(returns, dtype=float)
    if mat.ndim != 2 or mat.shape[1] < 2:
        raise ValueError("returns must be a T x N matrix with at least 2 configurations")
    if n_splits < 2 or n_splits % 2:
        raise ValueError("n_splits must be an even number >= 2")
    t, n = mat.shape
    if t < 2 * n_splits:
        raise ValueError(f"need at least {2 * n_splits} periods for {n_splits} splits, got {t}")
    mat = np.nan_to_num(mat, nan=0.0, posinf=0.0, neginf=0.0)
    score = metric or _sharpe_cols
    blocks = np.array_split(np.arange(t), n_splits)
    impl = overfit_backend(backend)
    logits = []
    for chosen in itertools.combinations(range(n_splits), n_splits // 2):
        is_rows = np.concatenate([blocks[i] for i in chosen])
        oos_rows = np.concatenate([blocks[i] for i in range(n_splits) if i not in chosen])
        is_perf = np.asarray(score(mat[is_rows]), dtype=float)
        oos_perf = np.asarray(score(mat[oos_rows]), dtype=float)
        value = impl.pbo(is_perf.tolist(), oos_perf.tolist())
        below = round((1.0 - value) * n)  # configurations the winner beats out of sample
        omega = (below + 1) / (n + 1)  # relative rank in (0, 1)
        logits.append(math.log(omega / (1.0 - omega)))
    arr = np.asarray(logits)
    return PBOResult(
        pbo=float((arr <= 0).mean()),
        logits=arr,
        n_splits=n_splits,
        n_combinations=len(arr),
        n_trials=n,
        backend=impl.name,
    )
