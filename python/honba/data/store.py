"""``CandleStore``: a Parquet candle catalog partitioned by symbol / timeframe / year."""

from __future__ import annotations

import os
import re
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path
from typing import Any, Protocol
from urllib.parse import quote, unquote

import pandas as pd

from honba.research.validation import CandleValidationError, Issue
from honba.strategy.market import TradingSession
from honba.strategy.mtf import Timeframe

from ._frames import CANDLE_COLUMNS, TZ, check_frame, normalise_frame

__all__ = ["AppendResult", "CandleLoader", "CandleStore"]

_PART = re.compile(r"year=(\d{4})\.parquet$")


class CandleLoader(Protocol):
    """Anything that can fetch candles (e.g. :class:`~honba.data.DhanLoader`)."""

    def fetch(
        self, symbol: str, timeframe: str, start: Any, end: Any, **kwargs: Any
    ) -> pd.DataFrame:
        """Return candles in the SDK schema for ``[start, end]``."""


@dataclass(frozen=True, slots=True)
class AppendResult:
    """Outcome of :meth:`CandleStore.append`."""

    added: int
    replaced: int
    total: int
    issues: list[Issue] = field(default_factory=list)


def _component(name: str, what: str) -> str:
    if not name or not name.strip():
        raise ValueError(f"empty {what}")
    safe = quote(name.strip(), safe="")
    if safe in {".", ".."}:
        raise ValueError(f"invalid {what} {name!r}")
    return safe


def _day(value: Any) -> pd.Timestamp:
    ts = pd.Timestamp(value)
    return ts.tz_localize(TZ) if ts.tzinfo is None else ts.tz_convert(TZ)


class CandleStore:
    """Parquet catalog of candles under ``root/symbol=<SYM>/timeframe=<TF>/year=<YYYY>.parquet``.

    Symbols are URL-quoted into directory names (``M&M`` is safe, path escapes are impossible).
    :meth:`append` is incremental: it rewrites only the year files the new bars touch, dedupes on
    time (new bars replace old) and validates with :func:`honba.validate_candles`. Pass a
    :class:`~honba.TradingSession` to make validation calendar-aware (holidays, weekends and
    overnight gaps are not "missing data"; bars outside the hours are errors).
    """

    def __init__(self, root: str | Path, *, session: TradingSession | None = None) -> None:
        self.root = Path(root)
        self.session = session

    # -- layout ----------------------------------------------------------------------------
    def _dir(self, symbol: str, timeframe: str) -> Path:
        tf = str(Timeframe.parse(timeframe))
        return self.root / f"symbol={_component(symbol, 'symbol')}" / f"timeframe={tf}"

    def _parts(self, symbol: str, timeframe: str) -> dict[int, Path]:
        folder = self._dir(symbol, timeframe)
        if not folder.is_dir():
            return {}
        found = {}
        for path in folder.iterdir():
            match = _PART.match(path.name)
            if match:
                found[int(match.group(1))] = path
        return dict(sorted(found.items()))

    # -- catalog ---------------------------------------------------------------------------
    def symbols(self) -> list[str]:
        """Symbols that have data."""
        if not self.root.is_dir():
            return []
        return sorted(
            unquote(p.name.removeprefix("symbol="))
            for p in self.root.iterdir()
            if p.name.startswith("symbol=") and p.is_dir()
        )

    def timeframes(self, symbol: str) -> list[str]:
        """Timeframes stored for ``symbol``."""
        folder = self.root / f"symbol={_component(symbol, 'symbol')}"
        if not folder.is_dir():
            return []
        return sorted(
            p.name.removeprefix("timeframe=")
            for p in folder.iterdir()
            if p.name.startswith("timeframe=") and self._parts(symbol, p.name[10:])
        )

    def coverage(self, symbol: str, timeframe: str) -> dict[str, Any] | None:
        """``{"first", "last", "rows"}`` of a partition, or ``None`` when empty."""
        frame = self.read(symbol, timeframe)
        if frame.empty:
            return None
        return {"first": frame["time"].iloc[0], "last": frame["time"].iloc[-1], "rows": len(frame)}

    def last_time(self, symbol: str, timeframe: str) -> pd.Timestamp | None:
        """Time of the newest stored bar (where an incremental fetch resumes)."""
        parts = self._parts(symbol, timeframe)
        if not parts:
            return None
        newest = pd.read_parquet(parts[max(parts)], columns=["time"])["time"]
        return None if newest.empty else pd.Timestamp(newest.max())

    # -- read / write ----------------------------------------------------------------------
    def read(
        self,
        symbol: str,
        timeframe: str,
        start: date | datetime | str | None = None,
        end: date | datetime | str | None = None,
    ) -> pd.DataFrame:
        """Candles of ``symbol`` / ``timeframe`` in ``[start, end]`` (dates are IST days)."""
        parts = self._parts(symbol, timeframe)
        lo = _day(start) if start is not None else None
        hi = _day(end) if end is not None else None
        if hi is not None and isinstance(end, (str, date)) and not isinstance(end, datetime):
            hi = hi + pd.Timedelta(days=1) - pd.Timedelta(microseconds=1)
        frames = [
            pd.read_parquet(path)
            for year, path in parts.items()
            if (lo is None or year >= lo.year) and (hi is None or year <= hi.year)
        ]
        if not frames:
            return pd.DataFrame({c: pd.Series(dtype="float64") for c in CANDLE_COLUMNS}).assign(
                time=pd.Series(dtype=f"datetime64[ns, {TZ}]")
            )
        out = pd.concat(frames, ignore_index=True)
        out["time"] = pd.DatetimeIndex(out["time"]).tz_convert(TZ)
        if lo is not None:
            out = out[out["time"] >= lo]
        if hi is not None:
            out = out[out["time"] <= hi]
        return out.reset_index(drop=True)

    def load(
        self,
        symbols: Sequence[str],
        timeframe: str,
        start: date | datetime | str | None = None,
        end: date | datetime | str | None = None,
    ) -> dict[str, pd.DataFrame]:
        """``{symbol: frame}`` ready for :func:`honba.backtest`; raises when a symbol is empty."""
        out = {s: self.read(s, timeframe, start, end) for s in symbols}
        empty = [s for s, f in out.items() if f.empty]
        if empty:
            raise KeyError(f"no {timeframe} candles stored for {empty}")
        return out

    def append(
        self,
        symbol: str,
        timeframe: str,
        frame: pd.DataFrame,
        *,
        validate: bool = True,
        session: TradingSession | None = None,
    ) -> AppendResult:
        """Merge ``frame`` into the catalog (new bars win on equal times).

        The incoming bars are validated first (``validate=True``): any error raises
        :class:`~honba.CandleValidationError` and nothing is written; warnings are returned in
        ``AppendResult.issues``.
        """
        tf = str(Timeframe.parse(timeframe))
        incoming = normalise_frame(frame)
        if incoming.empty:
            return AppendResult(0, 0, len(self.read(symbol, tf)))
        issues: list[Issue] = []
        if validate:
            issues = check_frame(incoming, symbol, session=session or self.session, timeframe=tf)
            if any(i.level == "error" for i in issues):
                raise CandleValidationError(issues)
        folder = self._dir(symbol, tf)
        folder.mkdir(parents=True, exist_ok=True)
        existing = self._parts(symbol, tf)
        added = replaced = 0
        for year, chunk in incoming.groupby(incoming["time"].dt.year):
            path = existing.get(int(year), folder / f"year={int(year)}.parquet")
            old = pd.read_parquet(path) if path.exists() else incoming.iloc[0:0]
            if len(old):
                old["time"] = pd.DatetimeIndex(old["time"]).tz_convert(TZ)
            dup = int(chunk["time"].isin(old["time"]).sum()) if len(old) else 0
            merged = pd.concat([old, chunk], ignore_index=True)
            merged = (
                merged.drop_duplicates("time", keep="last")
                .sort_values("time")
                .reset_index(drop=True)
            )
            tmp = path.with_suffix(".tmp")
            merged.to_parquet(tmp, index=False)
            os.replace(tmp, path)
            replaced += dup
            added += len(chunk) - dup
        return AppendResult(added, replaced, len(self.read(symbol, tf)), issues)

    def update(
        self,
        loader: CandleLoader,
        symbol: str,
        timeframe: str,
        *,
        start: date | datetime | str | None = None,
        end: date | datetime | str | None = None,
        **fetch_kwargs: Any,
    ) -> AppendResult:
        """Fetch what is missing with ``loader`` and append it (incremental refresh).

        Resumes at the newest stored bar (``start`` is only used for a first fetch); ``end``
        defaults to now.
        """
        last = self.last_time(symbol, timeframe)
        first = last if last is not None else start
        if first is None:
            raise ValueError("first fetch of a symbol needs start=")
        stop = end if end is not None else pd.Timestamp.now(tz=TZ)
        frame = loader.fetch(symbol, timeframe, first, stop, **fetch_kwargs)
        return self.append(symbol, timeframe, frame)

    def missing_sessions(
        self,
        symbol: str,
        timeframe: str,
        start: date | str,
        end: date | str,
        *,
        session: TradingSession | None = None,
    ) -> list[date]:
        """Trading days in ``[start, end]`` with no stored bars (holidays / weekends excluded)."""
        cal = session or self.session or TradingSession()
        frame = self.read(symbol, timeframe, start, end)
        have = set(frame["time"].dt.date) if len(frame) else set()
        days = pd.date_range(pd.Timestamp(start).date(), pd.Timestamp(end).date(), freq="D")
        return [d.date() for d in days if cal.is_trading_day(d.date()) and d.date() not in have]

    def delete(self, symbol: str, timeframe: str) -> int:
        """Remove a partition; returns the number of files deleted."""
        parts = self._parts(symbol, timeframe)
        for path in parts.values():
            path.unlink()
        return len(parts)
