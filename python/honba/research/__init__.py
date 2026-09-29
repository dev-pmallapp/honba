"""Research entry points: ``backtest`` / ``sweep`` over pluggable, engine-neutral backends.

Importing this package never loads an engine; ``honba.research._barter_adapter`` (the only
module that touches the compiled ``honba._core``) is imported lazily when the ``barter`` engine
is selected.
"""

from .backtest import backtest, sweep
from .config import BacktestConfig, CostModel
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
    "Metrics",
    "ReportSummary",
    "UnsupportedFeature",
    "available_engines",
    "backtest",
    "compute_metrics",
    "get_engine",
    "register_engine",
    "sweep",
    "validate_candles",
]
