"""What an engine can do, and the error raised when a strategy asks for more."""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, field

__all__ = ["EngineCapabilities", "UnsupportedFeature"]


class UnsupportedFeature(RuntimeError):  # noqa: N818 - public name fixed by the SDK contract
    """A strategy or config needs something the selected engine does not support."""

    def __init__(self, engine: str, missing: Iterable[str], where: str = "") -> None:
        self.engine = engine
        self.missing = sorted(set(missing))
        suffix = f" ({where})" if where else ""
        super().__init__(f"engine {engine!r} does not support: {', '.join(self.missing)}{suffix}")


@dataclass(frozen=True, slots=True)
class EngineCapabilities:
    """Declared feature set of an engine.

    Features are named strings: ``order:<kind>``, ``tif:<tif>``, ``product:<product>``,
    ``trail:<mode>``, ``bracket`` (attached stop_loss / take_profit), ``modify``, ``cancel``,
    ``multi_symbol``, ``session`` (hours, holidays, MIS square-off), ``instruments`` (lot / tick /
    freeze validation), ``cost:<model>``, ``fill:<model>``, ``warmup``, ``liquidate_at_end``
    (the engine flattens open positions itself at the end of the data), and the ``extra`` names
    ``margin``, ``attached_exit_same_bar``, ``slippage`` (adverse fill prices, volume-capped
    partial fills), ``price_bands`` (circuit limits on instruments), ``freeze_split`` (native
    freeze-quantity order splitting; without it slice orders with :func:`honba.split_order`),
    ``partial_exits`` (lists of stop-loss / take-profit legs, ``stop_update`` events).
    ``check`` and ``supports`` are the only consumers of the concrete fields.
    """

    name: str = "engine"
    order_kinds: frozenset[str] = frozenset({"market"})
    tifs: frozenset[str] = frozenset({"day"})
    products: frozenset[str] = frozenset({"CNC"})
    trail_modes: frozenset[str] = frozenset()
    brackets: bool = False
    modify: bool = False
    cancel: bool = True
    multi_symbol: bool = True
    sessions: bool = False
    instruments: bool = False
    cost_models: frozenset[str] = frozenset({"flat"})
    fill_models: frozenset[str] = frozenset({"close"})
    warmup: bool = False
    liquidate_at_end: bool = False
    extra: frozenset[str] = field(default_factory=frozenset)

    def supports(self, feature: str) -> bool:
        """True when ``feature`` (a name from the class docstring) is available."""
        kind, _, arg = feature.partition(":")
        table: dict[str, frozenset[str]] = {
            "order": self.order_kinds,
            "tif": self.tifs,
            "product": self.products,
            "trail": self.trail_modes,
            "cost": self.cost_models,
            "fill": self.fill_models,
        }
        if kind in table:
            return arg in table[kind]
        flags = {
            "bracket": self.brackets,
            "modify": self.modify,
            "cancel": self.cancel,
            "multi_symbol": self.multi_symbol,
            "session": self.sessions,
            "instruments": self.instruments,
            "warmup": self.warmup,
            "liquidate_at_end": self.liquidate_at_end,
        }
        return flags.get(feature, feature in self.extra)

    def missing(self, features: Iterable[str]) -> list[str]:
        """The subset of ``features`` this engine lacks."""
        return sorted({f for f in features if not self.supports(f)})

    def check(self, features: Iterable[str], where: str = "") -> None:
        """Raise :class:`UnsupportedFeature` when any feature is missing."""
        missing = self.missing(features)
        if missing:
            raise UnsupportedFeature(self.name, missing, where)
