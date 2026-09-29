"""Engine-neutral instructions a strategy hands to an engine (returned per bar)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from .types import Trail

__all__ = [
    "Action",
    "CancelAll",
    "CancelOrder",
    "ModifyOrder",
    "PlaceOrder",
    "required_features",
]

OrderKind = Literal["market", "limit", "stop", "stop_limit"]


@dataclass(frozen=True, slots=True)
class PlaceOrder:
    """Submit an order. ``stop`` is a stop-market, ``stop_limit`` a stop-limit order.

    ``price`` is the limit price (limit, stop_limit), ``trigger`` the stop trigger (stop,
    stop_limit; optional for a trailing stop). ``stop_loss`` / ``take_profit`` attach OCO exits
    that activate when this order fills; ``trail`` trails the attached stop (or, on a ``stop``
    order without ``stop_loss``, the order's own trigger).
    """

    id: str
    symbol: str
    side: Literal["buy", "sell"]
    qty: float
    kind: OrderKind = "market"
    price: float | None = None
    trigger: float | None = None
    tif: str | None = None
    product: str | None = None
    tag: str | None = None
    stop_loss: float | None = None
    take_profit: float | None = None
    trail: Trail | None = None
    reduce_only: bool = False


@dataclass(frozen=True, slots=True)
class ModifyOrder:
    """Change an open order, the attached exits of an entry, or ``<id>:sl`` / ``<id>:tp``.

    ``None`` leaves a field unchanged.
    """

    id: str
    qty: float | None = None
    price: float | None = None
    trigger: float | None = None
    tif: str | None = None
    stop_loss: float | None = None
    take_profit: float | None = None
    trail: Trail | None = None
    tag: str | None = None


@dataclass(frozen=True, slots=True)
class CancelOrder:
    """Cancel one order by id."""

    id: str


@dataclass(frozen=True, slots=True)
class CancelAll:
    """Cancel every open order (of ``symbol`` when given)."""

    symbol: str | None = None


Action = PlaceOrder | ModifyOrder | CancelOrder | CancelAll


def required_features(action: Action) -> set[str]:
    """Capability names an action needs (see :class:`EngineCapabilities`)."""
    if isinstance(action, PlaceOrder):
        need = {f"order:{action.kind}"}
        if action.tif:
            need.add(f"tif:{action.tif}")
        if action.product:
            need.add(f"product:{action.product}")
        if action.stop_loss is not None or action.take_profit is not None:
            need.add("bracket")
        if action.trail is not None:
            need.add(f"trail:{action.trail.mode}")
        return need
    if isinstance(action, ModifyOrder):
        need = {"modify"}
        if action.trail is not None:
            need.add(f"trail:{action.trail.mode}")
        if action.tif:
            need.add(f"tif:{action.tif}")
        return need
    return {"cancel"}
