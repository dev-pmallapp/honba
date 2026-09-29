"""The SDK candle frame: normalise any OHLCV table into ``time open high low close volume``."""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from honba.research import validate_candles
from honba.research._data import to_candles
from honba.research.validation import Issue
from honba.strategy.market import TradingSession

__all__ = ["CANDLE_COLUMNS", "TZ", "check_frame", "normalise_frame", "to_time_index"]

TZ = "Asia/Kolkata"
CANDLE_COLUMNS = ("time", "open", "high", "low", "close", "volume")

_TIME_ALIASES = ("time", "timestamp", "datetime", "date", "time_ms", "ts")
_VALUE_COLUMNS = ("open", "high", "low", "close", "volume")


def to_time_index(values: Any) -> pd.DatetimeIndex:
    """Convert dates / strings / epoch s or ms into an IST-aware index (naive means IST)."""
    series = pd.Series(values)
    if pd.api.types.is_numeric_dtype(series):
        ints = series.astype("int64")
        unit = np.where(ints.to_numpy() >= 10**11, "ms", "s")
        if len(set(unit)) > 1:
            raise ValueError("mixed epoch seconds and milliseconds")
        index = pd.DatetimeIndex(pd.to_datetime(ints, unit=str(unit[0]) if len(unit) else "s"))
        return index.tz_localize("UTC").tz_convert(TZ)
    index = pd.DatetimeIndex(pd.to_datetime(series))
    return index.tz_localize(TZ) if index.tz is None else index.tz_convert(TZ)


def normalise_frame(
    frame: pd.DataFrame, *, sort: bool = True, dedupe: bool = True, daily_midnight: bool = True
) -> pd.DataFrame:
    """Return ``frame`` in the SDK candle schema.

    Columns are lower-cased; the time comes from a ``time`` / ``timestamp`` / ``datetime`` /
    ``date`` column or the index and becomes an IST-aware ``time`` column (naive input is IST).
    ``volume`` defaults to 0. Rows are sorted and, on duplicate times, the last row wins.
    Whole-day timestamps stay at 00:00 IST (the daily convention).
    """
    df = frame.rename(columns=lambda c: str(c).strip().lower())
    col = next((c for c in _TIME_ALIASES if c in df.columns), None)
    times = df[col] if col else df.index.to_series()
    missing = [c for c in ("open", "high", "low", "close") if c not in df.columns]
    if missing:
        raise ValueError(f"missing candle columns {missing}")
    if "volume" not in df.columns:
        df = df.assign(volume=0.0)
    out = pd.DataFrame({"time": to_time_index(times.reset_index(drop=True))})
    for name in _VALUE_COLUMNS:
        out[name] = pd.to_numeric(df[name].reset_index(drop=True), errors="coerce").astype(float)
    if sort:
        out = out.sort_values("time", kind="stable")
    if dedupe:
        out = out.drop_duplicates("time", keep="last")
    return out.reset_index(drop=True)


def check_frame(
    frame: pd.DataFrame,
    symbol: str,
    *,
    session: TradingSession | None = None,
    timeframe: str | None = None,
) -> list[Issue]:
    """Run :func:`honba.validate_candles` on one normalised frame."""
    candles = to_candles({symbol: frame})
    return validate_candles(candles, session=session, timeframe=timeframe)
