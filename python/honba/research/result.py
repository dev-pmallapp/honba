"""BacktestResult: typed, defensive wrapper around the engine's JSON report."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import pandas as pd


@dataclass
class BacktestResult:
    """Parsed backtest report. ``raw`` always holds the untouched report dict."""

    raw: dict[str, Any]
    config: dict[str, Any] = field(default_factory=dict)
    params: dict[str, Any] = field(default_factory=dict)

    @property
    def summary(self) -> dict[str, Any]:
        """Summary metrics (total_pnl, sharpe, sortino, max_drawdown, win_rate, ...)."""
        return dict(self.raw.get("summary") or {})

    @property
    def instruments(self) -> dict[str, Any]:
        """Per-instrument metrics."""
        return dict(self.raw.get("instruments") or {})

    @property
    def trades(self) -> pd.DataFrame:
        """Trades as a DataFrame (empty if none); a ``time`` column is parsed when present."""
        rows = self.raw.get("trades") or []
        frame = pd.DataFrame(rows)
        for col in ("time", "time_ms", "timestamp"):
            if col in frame.columns and pd.api.types.is_numeric_dtype(frame[col]):
                frame[col] = pd.to_datetime(frame[col], unit="ms", utc=True)
        return frame

    @property
    def equity_curve(self) -> pd.Series:
        """Equity indexed by UTC timestamp (empty Series if absent)."""
        pts = self.raw.get("equity_curve") or []
        if not pts:
            return pd.Series(dtype=float, name="equity")
        idx = pd.to_datetime([p[0] for p in pts], unit="ms", utc=True)
        return pd.Series([float(p[1]) for p in pts], index=idx, name="equity")

    def metric(self, name: str, default: float | None = None) -> Any:
        """Look up one summary metric."""
        return self.summary.get(name, default)

    def __repr__(self) -> str:
        """Show the headline metrics only."""
        keys = ("total_pnl", "sharpe", "sortino", "max_drawdown", "win_rate")
        shown = {k: self.summary[k] for k in keys if k in self.summary}
        return f"BacktestResult({shown})"
