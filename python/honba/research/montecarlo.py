"""Monte Carlo on the trade list (pure numpy post-processing of round-trip PnL).

Each simulation rebuilds an equity path ``capital + cumsum(pnl)`` from a reordered or
resampled sequence of the net round-trip PnLs:

- ``shuffle``: a random permutation (same trades, other order; the final PnL is unchanged,
  drawdowns and the risk of ruin are what varies);
- ``resample``: i.i.d. bootstrap with replacement (same number of trades);
- ``block``: moving-block bootstrap (blocks of ``block`` consecutive trades), which keeps
  short-range dependence such as streaks.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Any, Literal

import numpy as np
import pandas as pd

__all__ = ["MonteCarloResult", "monte_carlo_trades"]

Method = Literal["shuffle", "resample", "block"]
_CHUNK = 2_000


@dataclass(frozen=True)
class MonteCarloResult:
    """Distributions over ``n`` simulated trade sequences.

    Arrays have one value per simulation: ``final_equity``, ``total_return`` (fraction of
    ``capital``), ``max_drawdown`` (fraction of the running peak, >= 0) and ``ruined`` (equity
    fell to ``capital * (1 - ruin)`` or below at some point). ``original`` holds the same
    figures for the actual trade order. ``paths`` (``n x (trades + 1)``) is kept only with
    ``keep_paths=True``.
    """

    method: str
    n: int
    n_trades: int
    capital: float
    ruin: float
    seed: int | None
    final_equity: np.ndarray = field(repr=False)
    total_return: np.ndarray = field(repr=False)
    max_drawdown: np.ndarray = field(repr=False)
    ruined: np.ndarray = field(repr=False)
    original: dict[str, float] = field(default_factory=dict)
    paths: np.ndarray | None = field(default=None, repr=False)

    @property
    def ruin_probability(self) -> float:
        """Share of simulations that hit the ruin level."""
        return float(self.ruined.mean()) if self.n else 0.0

    def drawdown_probability(self, level: float) -> float:
        """Share of simulations whose max drawdown reaches ``level`` (a fraction, 0.2 = 20%)."""
        return float((self.max_drawdown >= level).mean()) if self.n else 0.0

    def percentiles(self, q: Sequence[float] = (5, 25, 50, 75, 95)) -> pd.DataFrame:
        """Percentile table: rows ``total_return``, ``max_drawdown``, ``final_equity``."""
        rows = {
            "total_return": self.total_return,
            "max_drawdown": self.max_drawdown,
            "final_equity": self.final_equity,
        }
        cols = [f"p{g:g}" for g in q]
        data = {
            k: (np.percentile(v, list(q)) if len(v) else [np.nan] * len(q)) for k, v in rows.items()
        }
        return pd.DataFrame(data, index=cols).T

    def to_frame(self) -> pd.DataFrame:
        """One row per simulation."""
        return pd.DataFrame(
            {
                "final_equity": self.final_equity,
                "total_return": self.total_return,
                "max_drawdown": self.max_drawdown,
                "ruined": self.ruined,
            }
        )

    def summary(self) -> dict[str, Any]:
        """Headline figures (JSON-friendly)."""
        pct = self.percentiles()
        return {
            "method": self.method,
            "n": self.n,
            "n_trades": self.n_trades,
            "ruin": self.ruin,
            "ruin_probability": self.ruin_probability,
            "original": dict(self.original),
            "percentiles": {
                row: {col: float(v) for col, v in pct.loc[row].items()} for row in pct.index
            },
        }

    def __repr__(self) -> str:
        if not self.n_trades:
            return f"MonteCarloResult({self.method}, n={self.n}, no trades)"
        dd = np.percentile(self.max_drawdown, [50, 95])
        return (
            f"MonteCarloResult({self.method}, n={self.n}, trades={self.n_trades}, "
            f"max_drawdown p50={dd[0]:.2%} p95={dd[1]:.2%}, "
            f"ruin({self.ruin:.0%})={self.ruin_probability:.2%})"
        )


def _indices(rng: np.random.Generator, method: str, n: int, k: int, block: int) -> np.ndarray:
    if method == "shuffle":
        return rng.permuted(np.tile(np.arange(k), (n, 1)), axis=1)
    if method == "resample":
        return rng.integers(0, k, size=(n, k))
    blocks = -(-k // block)
    starts = rng.integers(0, k - block + 1, size=(n, blocks))
    idx = (starts[:, :, None] + np.arange(block)[None, None, :]).reshape(n, blocks * block)
    return idx[:, :k]


def _path_stats(
    paths: np.ndarray, capital: float, ruin_level: float
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    peak = np.maximum.accumulate(paths, axis=1)
    with np.errstate(divide="ignore", invalid="ignore"):
        dd = np.where(peak > 0, 1.0 - paths / peak, 1.0)
    return paths[:, -1], dd.max(axis=1), (paths <= ruin_level).any(axis=1)


def monte_carlo_trades(
    pnl: Sequence[float] | np.ndarray,
    capital: float,
    *,
    n: int = 1000,
    method: Method = "shuffle",
    block: int | None = None,
    ruin: float = 0.5,
    seed: int | None = None,
    keep_paths: bool = False,
) -> MonteCarloResult:
    """Simulate ``n`` equity paths from the trade PnLs.

    ``ruin`` is the loss (fraction of ``capital``) that counts as ruin: 0.5 = equity fell to
    half the starting capital. ``block`` is the block length of ``method="block"`` (default
    the cube root of the trade count, at least 2). ``seed`` makes the draw reproducible.
    """
    if method not in ("shuffle", "resample", "block"):
        raise ValueError(f"method must be shuffle, resample or block, got {method!r}")
    if n < 1:
        raise ValueError("n must be >= 1")
    if not 0 < ruin <= 1:
        raise ValueError("ruin must be in (0, 1]")
    if not capital > 0:
        raise ValueError("capital must be positive")
    trades = np.asarray(pnl, dtype=float)
    k = len(trades)
    ruin_level = capital * (1.0 - ruin)
    original_path = np.concatenate(([capital], capital + np.cumsum(trades)))[None, :]
    o_final, o_dd, o_ruined = _path_stats(original_path, capital, ruin_level)
    original = {
        "final_equity": float(o_final[0]),
        "total_return": float(o_final[0] / capital - 1.0),
        "max_drawdown": float(o_dd[0]),
        "ruined": bool(o_ruined[0]),
    }
    if k == 0:
        return MonteCarloResult(
            method, n, 0, capital, ruin, seed, np.full(n, capital), np.zeros(n), np.zeros(n),
            np.zeros(n, dtype=bool), original, np.full((n, 1), capital) if keep_paths else None,
        )  # fmt: skip
    if block is None:
        block = max(2, round(k ** (1 / 3)))
    block = int(min(max(block, 1), k))
    rng = np.random.default_rng(seed)
    finals, dds, ruined, kept = [], [], [], []
    for start in range(0, n, _CHUNK):
        m = min(_CHUNK, n - start)
        draws = trades[_indices(rng, method, m, k, block)]
        paths = np.concatenate((np.full((m, 1), capital), capital + np.cumsum(draws, axis=1)), 1)
        f, d, r = _path_stats(paths, capital, ruin_level)
        finals.append(f)
        dds.append(d)
        ruined.append(r)
        if keep_paths:
            kept.append(paths)
    final = np.concatenate(finals)
    return MonteCarloResult(
        method=method,
        n=n,
        n_trades=k,
        capital=float(capital),
        ruin=float(ruin),
        seed=seed,
        final_equity=final,
        total_return=final / capital - 1.0,
        max_drawdown=np.concatenate(dds),
        ruined=np.concatenate(ruined),
        original=original,
        paths=np.concatenate(kept) if keep_paths else None,
    )
