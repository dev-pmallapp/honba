"""honba: systemic market research platform for Indian securities.

``import honba as hb`` gives everything a strategy file needs. The SDK is backend-agnostic:
strategies, orders and results use SDK-owned types, and engines (barter by default) plug in
behind :class:`honba.research.BacktestEngine`.
"""

__version__ = "0.1.0"

from .orders import split_order
from .research import (
    BacktestConfig,
    BacktestEngine,
    BacktestResult,
    CandleValidationError,
    CostModel,
    MarginConfig,
    Metrics,
    OptimizationResult,
    WalkForwardResult,
    available_engines,
    backtest,
    optimize,
    register_engine,
    sweep,
    validate_candles,
    walk_forward,
)
from .strategy import (
    CNC,
    MIS,
    MTF,
    NRML,
    Bar,
    BarContext,
    EngineCapabilities,
    Fill,
    FillReason,
    Instrument,
    Order,
    OrderHandle,
    Param,
    PortfolioStrategy,
    Position,
    RejectReason,
    RoundTrip,
    Strategy,
    TradingSession,
    Trail,
    UnsupportedFeature,
    indicators,
)

ta = indicators

__all__ = [
    "CNC",
    "MIS",
    "MTF",
    "NRML",
    "BacktestConfig",
    "BacktestEngine",
    "BacktestResult",
    "Bar",
    "BarContext",
    "CandleValidationError",
    "CostModel",
    "EngineCapabilities",
    "Fill",
    "FillReason",
    "Instrument",
    "MarginConfig",
    "Metrics",
    "OptimizationResult",
    "Order",
    "OrderHandle",
    "Param",
    "PortfolioStrategy",
    "Position",
    "RejectReason",
    "RoundTrip",
    "Strategy",
    "TradingSession",
    "Trail",
    "UnsupportedFeature",
    "WalkForwardResult",
    "available_engines",
    "backtest",
    "indicators",
    "optimize",
    "register_engine",
    "split_order",
    "sweep",
    "ta",
    "validate_candles",
    "walk_forward",
]
