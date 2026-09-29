"""Corporate actions: split / bonus back-adjustment of candles, dividends recorded only."""

from __future__ import annotations

import csv
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Literal

import numpy as np
import pandas as pd

from ._frames import TZ

__all__ = ["CorporateAction", "adjust_candles", "adjustment_factors", "load_actions_csv"]

Kind = Literal["split", "bonus", "dividend"]
_PRICE_COLUMNS = ("open", "high", "low", "close")


@dataclass(frozen=True, slots=True)
class CorporateAction:
    """One corporate action effective on ``ex_date`` (the first session trading ex-entitlement).

    ``split``: ``ratio`` is new shares per old share (a 10 -> 2 face-value split is ``5``).
    ``bonus``: ``ratio`` is bonus shares per share held (a 1:1 bonus is ``1``, 1:2 is ``0.5``).
    ``dividend``: ``amount`` per share, recorded only (prices are not adjusted, cash is not
    credited by the backtest).
    """

    symbol: str
    ex_date: date
    kind: Kind
    ratio: float = 1.0
    amount: float = 0.0

    def __post_init__(self) -> None:
        if self.kind not in ("split", "bonus", "dividend"):
            raise ValueError(f"kind must be split, bonus or dividend, got {self.kind!r}")
        if self.kind == "split" and not self.ratio > 0:
            raise ValueError("split ratio must be positive")
        if self.kind == "bonus" and not self.ratio > 0:
            raise ValueError("bonus ratio must be positive")
        if self.kind == "dividend" and self.amount < 0:
            raise ValueError("dividend amount must be >= 0")

    @property
    def factor(self) -> float:
        """Share-count multiplier at ``ex_date`` (1.0 for dividends)."""
        if self.kind == "split":
            return float(self.ratio)
        if self.kind == "bonus":
            return 1.0 + float(self.ratio)
        return 1.0


def _ratio(text: str) -> float:
    text = text.strip()
    if ":" in text:
        new, _, old = text.partition(":")
        return float(new) / float(old)
    return float(text)


def load_actions_csv(path: str | Path) -> list[CorporateAction]:
    """Read actions from a CSV with ``symbol, ex_date, action[, ratio][, amount]`` columns.

    ``action`` is ``split`` / ``bonus`` / ``dividend``. ``ratio`` is a number or ``"N:M"`` text
    (split: N new shares per M old, ``5:1``; bonus: N bonus shares per M held, ``1:1``).
    """
    out: list[CorporateAction] = []
    with open(path, newline="", encoding="utf-8-sig") as handle:
        for line, raw in enumerate(csv.DictReader(handle), start=2):
            row = {k.strip().lower(): (v or "").strip() for k, v in raw.items() if k}
            try:
                kind = (row.get("action") or row.get("kind") or "").lower()
                out.append(
                    CorporateAction(
                        symbol=row["symbol"],
                        ex_date=datetime.fromisoformat(row["ex_date"]).date(),
                        kind=kind,  # type: ignore[arg-type]
                        ratio=_ratio(row["ratio"]) if row.get("ratio") else 1.0,
                        amount=float(row["amount"]) if row.get("amount") else 0.0,
                    )
                )
            except (KeyError, ValueError) as exc:
                raise ValueError(f"{path}:{line}: bad corporate action row ({exc})") from None
    return out


def adjustment_factors(
    times: pd.Series | pd.DatetimeIndex, actions: Iterable[CorporateAction]
) -> np.ndarray:
    """Cumulative share-count multiplier for each bar time (1.0 on and after the last action).

    A bar before an action's ``ex_date`` (IST midnight) is scaled by that action's factor, so
    prices divide and volumes multiply by the returned value.
    """
    index = pd.DatetimeIndex(times)
    index = index.tz_localize(TZ) if index.tz is None else index.tz_convert(TZ)
    factor = np.ones(len(index))
    for act in actions:
        if act.factor == 1.0:
            continue
        cutoff = pd.Timestamp(act.ex_date).tz_localize(TZ)
        factor = np.where(index < cutoff, factor * act.factor, factor)
    return factor


def adjust_candles(
    frame: pd.DataFrame | Mapping[str, pd.DataFrame],
    actions: Iterable[CorporateAction],
    *,
    symbol: str | None = None,
) -> pd.DataFrame | dict[str, pd.DataFrame]:
    """Back-adjust candles for splits and bonus issues (dividends are only recorded).

    Prices before each ``ex_date`` are divided by the action's factor and volume is multiplied by
    it, so the series is continuous and traded value is preserved. Pass one frame with
    ``symbol=`` (actions of other symbols are ignored; omitted, every action applies) or a
    ``{symbol: frame}`` mapping. The input is not modified. Dividends of the frame's symbol are
    listed in ``result.attrs["dividends"]`` and the applied actions in
    ``result.attrs["corporate_actions"]``: nothing is credited to cash.
    """
    acts = list(actions)
    if isinstance(frame, Mapping):
        return {sym: adjust_candles(f, acts, symbol=sym) for sym, f in frame.items()}  # type: ignore[misc]
    mine = [a for a in acts if symbol is None or a.symbol.upper() == symbol.upper()]
    out = frame.copy()
    factor = adjustment_factors(out["time"], mine)
    for col in _PRICE_COLUMNS:
        out[col] = out[col].to_numpy(dtype=float) / factor
    if "volume" in out.columns:
        out["volume"] = out["volume"].to_numpy(dtype=float) * factor
    out.attrs["corporate_actions"] = [a for a in mine if a.kind != "dividend"]
    out.attrs["dividends"] = [a for a in mine if a.kind == "dividend"]
    return out
