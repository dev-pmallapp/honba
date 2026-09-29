"""Research entry points: ``backtest`` / ``sweep`` over pluggable, engine-neutral backends.

Importing this package never loads an engine; ``honba.research._barter_adapter`` (the only
module that touches the compiled ``honba._core``) is imported lazily when the ``barter`` engine
is selected.
"""

from .backtest import backtest, sweep
from .config import BacktestConfig, CostModel, MarginConfig
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
from .optimize import OptimizationResult, WalkForwardResult, optimize, walk_forward
from .overfit import PBOResult, cscv_pbo, deflated_sharpe, dsr, pbo
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
    "OptimizationResult",
    "PBOResult",
    "ReportSummary",
    "UnsupportedFeature",
    "WalkForwardResult",
    "available_engines",
    "backtest",
    "compute_metrics",
    "cscv_pbo",
    "deflated_sharpe",
    "dsr",
    "get_engine",
    "optimize",
    "pbo",
    "register_engine",
    "sweep",
    "validate_candles",
    "walk_forward",
]
