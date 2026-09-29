"""Order helpers that need no engine support (freeze-quantity slicing)."""

from __future__ import annotations

import math

__all__ = ["split_order"]


def split_order(
    qty: float, freeze_qty: float | None, lot_size: float = 1.0, *, balanced: bool = False
) -> list[float]:
    """Slice ``qty`` into orders no larger than ``freeze_qty``, each a whole number of lots.

    Exchanges reject F&O orders above the freeze quantity; the slices sum to ``qty`` and every
    slice is a multiple of ``lot_size`` (the largest allowed slice is ``freeze_qty`` rounded down
    to a lot multiple). The sign of ``qty`` is kept, so a sell of -5000 gives negative slices.
    By default full slices come first and the remainder last; ``balanced=True`` spreads the
    quantity evenly over the fewest slices (lots differ by at most one). ``freeze_qty`` of
    ``None`` or zero means no limit. Raises ``ValueError`` when ``qty`` is not a lot multiple or
    ``freeze_qty`` is smaller than one lot. Use it when the engine has no native order splitting
    (see ``EngineCapabilities``).
    """
    if not lot_size > 0:
        raise ValueError("lot_size must be positive")
    lots = _lots(abs(qty), lot_size)
    if lots is None:
        raise ValueError(f"qty {qty} is not a multiple of the lot size {lot_size}")
    if lots == 0:
        return []
    sign = math.copysign(1.0, qty)
    if not freeze_qty or freeze_qty <= 0:
        return [qty]
    per_slice = math.floor(round(freeze_qty / lot_size, 9))
    if per_slice < 1:
        raise ValueError(f"freeze_qty {freeze_qty} is smaller than one lot ({lot_size})")
    n = math.ceil(lots / per_slice)
    if balanced:
        base, extra = divmod(lots, n)
        sizes = [base + 1] * extra + [base] * (n - extra)
    else:
        sizes = [per_slice] * (lots // per_slice) + ([lots % per_slice] if lots % per_slice else [])
    return [sign * s * lot_size for s in sizes]


def _lots(qty: float, lot_size: float) -> int | None:
    ratio = qty / lot_size
    lots = round(ratio)
    return lots if math.isclose(ratio, lots, rel_tol=0, abs_tol=1e-9) else None
