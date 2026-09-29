"""The engine-neutral backtest layer: request / report types, the engine protocol, the registry.

An engine turns a :class:`BacktestRequest` into a :class:`BacktestReport` by replaying the
candles and calling the ``on_bar`` handler once per bar timestamp with a
:class:`~honba.strategy.types.BarContext`; the handler returns neutral actions
(:class:`~honba.strategy.actions.PlaceOrder`, ...). Engines declare what they support in
:class:`EngineCapabilities`; the SDK raises :class:`UnsupportedFeature` before running when a
request needs more. Third-party engines register through :func:`register_engine` or the
``honba.engines`` entry-point group. See ``docs/interfaces/python-sdk.md`` (Adding an engine).
"""

from __future__ import annotations

import importlib
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from importlib.metadata import entry_points
from typing import Any, Protocol, runtime_checkable

from honba.strategy.actions import Action
from honba.strategy.capabilities import EngineCapabilities, UnsupportedFeature
from honba.strategy.series import Bars
from honba.strategy.types import (
    BarContext,
    Costs,
    Fill,
    Order,
    Position,
    Reject,
    RoundTrip,
)

from .config import BacktestConfig, MarginConfig

__all__ = [
    "BacktestEngine",
    "BacktestReport",
    "BacktestRequest",
    "BarHandler",
    "EngineCapabilities",
    "ReportSummary",
    "UnsupportedFeature",
    "available_engines",
    "config_features",
    "get_engine",
    "register_engine",
]

BarHandler = Callable[[BarContext], Sequence[Action]]


@dataclass(frozen=True, slots=True)
class BacktestRequest:
    """Input of one engine run: the neutral config plus closed candles per symbol.

    ``start_ms`` is the first non-warm-up bar (already resolved from ``config.start`` /
    ``config.warmup_bars``); bars before it are warm-up.
    """

    config: BacktestConfig
    candles: dict[str, Bars]
    start_ms: int | None = None

    @property
    def symbols(self) -> tuple[str, ...]:
        """Symbols of the run."""
        return tuple(self.candles)

    @property
    def last_ms(self) -> int:
        """Timestamp of the last bar of any symbol."""
        return max(int(b.time_ms[-1]) for b in self.candles.values() if len(b))


@dataclass(slots=True)
class ReportSummary:
    """Portfolio level results as computed by the engine (metrics may be ``None``)."""

    initial_cash: float
    final_cash: float
    final_equity: float
    net_pnl: float
    total_return: float
    realised_pnl: float = 0.0
    total_fees: float = 0.0
    costs: Costs = field(default_factory=Costs)
    num_trades: int = 0
    num_closing_trades: int = 0
    num_round_trips: int | None = None
    num_orders: int = 0
    num_rejected: int = 0
    max_drawdown: float = 0.0
    cagr: float | None = None
    sharpe: float | None = None
    sortino: float | None = None
    calmar: float | None = None
    win_rate: float | None = None
    profit_factor: float | None = None

    def as_dict(self) -> dict[str, Any]:
        """Flat dict (``costs`` as a dict)."""
        out = {k: getattr(self, k) for k in self.__dataclass_fields__ if k != "costs"}
        out["costs"] = {k: getattr(self.costs, k) for k in Costs.__dataclass_fields__}
        return out


@dataclass(slots=True)
class BacktestReport:
    """Output of one engine run, in SDK types. ``raw`` keeps the engine's own report."""

    summary: ReportSummary
    fills: list[Fill] = field(default_factory=list)
    orders: list[Order] = field(default_factory=list)
    rejected: list[Reject] = field(default_factory=list)
    equity_curve: list[tuple[int, float]] = field(default_factory=list)
    round_trips: list[RoundTrip] | None = None  # engine-computed (net); None = SDK computes
    positions: dict[str, Position] = field(default_factory=dict)
    instruments: dict[str, dict[str, Any]] = field(default_factory=dict)
    start_ms: int | None = None
    num_bars: int = 0
    warmup_bars: int = 0
    engine: str = ""
    contract_version: int | None = None
    raw: Any = None


@runtime_checkable
class BacktestEngine(Protocol):
    """What an engine implements."""

    name: str

    def capabilities(self) -> EngineCapabilities:
        """The features this engine supports."""
        ...

    def run(self, request: BacktestRequest, on_bar: BarHandler) -> BacktestReport:
        """Replay ``request.candles``, calling ``on_bar`` once per bar timestamp."""
        ...


def config_features(request: BacktestRequest) -> set[str]:
    """Capability names a request needs regardless of what the strategy does."""
    cfg = request.config
    need = {f"cost:{cfg.costs.model}", f"fill:{cfg.fill}"}
    if len(request.candles) > 1:
        need.add("multi_symbol")
    if cfg.session is not None:
        need.add("session")
    if cfg.instruments:
        need.add("instruments")
    if request.start_ms is not None:
        need.add("warmup")
    if cfg.margin != MarginConfig():
        need.add("margin")
    if cfg.attached_exit_same_bar:
        need.add("attached_exit_same_bar")
    return need


# -- registry --------------------------------------------------------------------------------

_BUILTIN = {
    "barter": "honba.research._barter_adapter:BarterEngine",
    "simple": "honba.research.simple_engine:SimpleEngine",
}
_registered: dict[str, Callable[[], BacktestEngine] | str] = {}
ENTRY_POINT_GROUP = "honba.engines"


def register_engine(name: str, factory: Callable[[], BacktestEngine] | str) -> None:
    """Make an engine selectable as ``backtest(..., engine=name)``.

    ``factory`` is a zero-argument callable returning an engine (an engine class works), or a
    lazy ``"package.module:attribute"`` string resolved on first use.
    """
    _registered[name] = factory


def _entry_points() -> dict[str, Any]:
    return {ep.name: ep for ep in entry_points(group=ENTRY_POINT_GROUP)}


def available_engines() -> list[str]:
    """Names accepted by :func:`get_engine`."""
    return sorted({*_BUILTIN, *_registered, *_entry_points()})


def _resolve(factory: Callable[[], BacktestEngine] | str) -> Callable[[], BacktestEngine]:
    if isinstance(factory, str):
        module, _, attr = factory.partition(":")
        return getattr(importlib.import_module(module), attr)
    return factory


def get_engine(engine: str | BacktestEngine | None = None) -> BacktestEngine:
    """Resolve an engine.

    ``None`` is barter, a string is looked up (registered names, then ``honba.engines`` entry
    points, then built-ins), an instance is returned as is.
    """
    if engine is None:
        engine = "barter"
    if not isinstance(engine, str):
        if not isinstance(engine, BacktestEngine):
            raise TypeError("engine must be a name or a BacktestEngine (name, capabilities, run)")
        return engine
    if engine in _registered:
        return _resolve(_registered[engine])()
    points = _entry_points()
    if engine in points:
        return points[engine].load()()
    if engine in _BUILTIN:
        return _resolve(_BUILTIN[engine])()
    raise ValueError(f"unknown engine {engine!r}; available: {available_engines()}")
