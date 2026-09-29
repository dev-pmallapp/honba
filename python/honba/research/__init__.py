"""Research entry points: ``backtest`` / ``sweep`` over pluggable, engine-neutral backends.

Importing this package never loads an engine; ``honba.research._barter_adapter`` (the only
module that touches the compiled ``honba._core``) is imported lazily when the ``barter`` engine
is selected.
"""

from .backtest import backtest, sweep
from .config import BacktestConfig, CostModel, MarginConfig, Settlement, Slippage
from .engine import (
    BacktestEngine,
    BacktestReport,
    BacktestRequest,
    EngineCapabilities,
    ReportSummary,
    UnsupportedFeature,
    available_engines,
    get_engine,
    register_engine,
)
from .metrics import Metrics, compute_metrics
from .montecarlo import MonteCarloResult, monte_carlo_trades
from .optimize import OptimizationResult, WalkForwardResult, optimize, walk_forward
from .overfit import PBOResult, cscv_pbo, deflated_sharpe, dsr, pbo
from .report import benchmark_metrics, monthly_returns
from .result import BacktestResult
from .validation import CandleValidationError, Issue, validate_candles

__all__ = [
    "BacktestConfig",
    "BacktestEngine",
    "BacktestReport",
    "BacktestRequest",
    "BacktestResult",
    "CandleValidationError",
    "CostModel",
    "EngineCapabilities",
    "Issue",
    "MarginConfig",
    "Metrics",
    "MonteCarloResult",
    "OptimizationResult",
    "PBOResult",
    "ReportSummary",
    "Settlement",
    "Slippage",
    "UnsupportedFeature",
    "WalkForwardResult",
    "available_engines",
    "backtest",
    "benchmark_metrics",
    "compute_metrics",
    "cscv_pbo",
    "deflated_sharpe",
    "dsr",
    "get_engine",
    "monte_carlo_trades",
    "monthly_returns",
    "optimize",
    "pbo",
    "register_engine",
    "sweep",
    "validate_candles",
    "walk_forward",
]
