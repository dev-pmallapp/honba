"""Normalise user candle inputs (pandas / polars / dict / rows) into ``Bars`` per symbol."""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from honba.strategy.series import Bars
from honba.strategy.types import IST

_TIME_COLS = ("time_ms", "timestamp", "time", "datetime", "date", "ts")
_OHLCV = ("open", "high", "low", "close", "volume")


def _to_pandas(obj: Any) -> pd.DataFrame:
    if isinstance(obj, pd.DataFrame):
        return obj
    if hasattr(obj, "to_dict") and type(obj).__module__.startswith("polars"):
        return pd.DataFrame(obj.to_dict(as_series=False))
    return pd.DataFrame(obj)


def _time_ms(frame: pd.DataFrame) -> np.ndarray:
    """Epoch milliseconds; naive datetimes are IST (Indian data), aware ones are converted."""
    col = next((c for c in _TIME_COLS if c in frame.columns), None)
    values = frame[col] if col else frame.index.to_series()
    if pd.api.types.is_datetime64_any_dtype(values):
        values = pd.DatetimeIndex(values)
        values = values.tz_localize(IST) if values.tz is None else values
        return (values.tz_convert("UTC").as_unit("ns").asi8 // 1_000_000).astype(np.int64)
    if pd.api.types.is_object_dtype(values):  # e.g. python dates / ISO strings
        return _time_ms(frame.assign(**{col or "time": pd.to_datetime(values)}))
    ints = pd.to_numeric(values).astype("int64").to_numpy()
    # Heuristic: epoch seconds are < 1e11, milliseconds above.
    return np.where(ints >= 10**11, ints, ints * 1000).astype(np.int64)


def to_candles(
    data: Any, symbols: list[str] | str | None = None, *, sort: bool = False
) -> dict[str, Bars]:
    """Convert ``data`` to ``{symbol: Bars}`` (rows kept in input order unless ``sort``).

    ``data`` may be a ``{symbol: frame}`` mapping, a single frame (needs ``symbols`` with one
    name, or a ``symbol`` column), or a long-format frame with a ``symbol`` column. Frames need
    open / high / low / close (volume optional) and a time column or datetime index.
    """
    if isinstance(symbols, str):
        symbols = [symbols]
    if isinstance(data, dict):
        frames = {str(k): _to_pandas(v) for k, v in data.items()}
    else:
        frame = _to_pandas(data)
        if "symbol" in frame.columns:
            frames = {str(k): g.drop(columns="symbol") for k, g in frame.groupby("symbol")}
        elif symbols and len(symbols) == 1:
            frames = {symbols[0]: frame}
        else:
            raise ValueError("a single DataFrame needs a 'symbol' column or exactly one symbol")
    if symbols:
        missing = [s for s in symbols if s not in frames]
        if missing:
            raise ValueError(f"no candles for symbols: {missing}")
        frames = {s: frames[s] for s in symbols}

    out: dict[str, Bars] = {}
    for sym, frame in frames.items():
        frame = frame.rename(columns=str.lower)
        absent = [c for c in _OHLCV if c not in frame.columns and c != "volume"]
        if absent:
            raise ValueError(f"{sym}: missing columns {absent}")
        if "volume" not in frame.columns:
            frame = frame.assign(volume=0.0)
        times = _time_ms(frame)
        cols = {k: frame[k].to_numpy(dtype=float) for k in _OHLCV}
        if sort:
            order = np.argsort(times, kind="stable")
            times, cols = times[order], {k: v[order] for k, v in cols.items()}
        out[sym] = Bars({"time_ms": times, **cols})
    return out
