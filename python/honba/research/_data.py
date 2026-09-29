"""Normalise user candle inputs (pandas / polars / dict / rows) into engine tuples."""

from __future__ import annotations

from typing import Any

import pandas as pd

_TIME_COLS = ("time_ms", "timestamp", "time", "datetime", "date", "ts")
_OHLCV = ("open", "high", "low", "close", "volume")


def _to_pandas(obj: Any) -> pd.DataFrame:
    if isinstance(obj, pd.DataFrame):
        return obj
    if hasattr(obj, "to_dict") and type(obj).__module__.startswith("polars"):
        return pd.DataFrame(obj.to_dict(as_series=False))
    return pd.DataFrame(obj)


def _time_ms(frame: pd.DataFrame) -> pd.Series:
    col = next((c for c in _TIME_COLS if c in frame.columns), None)
    values = frame[col] if col else frame.index.to_series()
    if pd.api.types.is_datetime64_any_dtype(values):
        values = pd.to_datetime(values, utc=True)
        epoch = pd.Timestamp("1970-01-01", tz="UTC")
        return (
            ((values - epoch) // pd.Timedelta(milliseconds=1))
            .astype("int64")
            .reset_index(drop=True)
        )
    ints = pd.to_numeric(values).astype("int64").reset_index(drop=True)
    # Heuristic: epoch seconds are < 1e11, milliseconds above.
    return ints.where(ints >= 10**11, ints * 1000)


def to_candles(
    data: Any, symbols: list[str] | str | None = None
) -> dict[str, list[tuple[int, float, float, float, float, float]]]:
    """Convert ``data`` to ``{symbol: [(ms, o, h, l, c, v), ...]}`` sorted by time.

    ``data`` may be a ``{symbol: frame}`` mapping, a single frame (needs ``symbols`` with one
    name, or a ``symbol`` column), or a long-format frame with a ``symbol`` column.
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

    out: dict[str, list[tuple[int, float, float, float, float, float]]] = {}
    for sym, frame in frames.items():
        frame = frame.rename(columns=str.lower)
        absent = [c for c in _OHLCV if c not in frame.columns and c != "volume"]
        if absent:
            raise ValueError(f"{sym}: missing columns {absent}")
        if "volume" not in frame.columns:
            frame = frame.assign(volume=0.0)
        times = _time_ms(frame)
        vals = frame[list(_OHLCV)].astype(float).reset_index(drop=True)
        rows = sorted(
            (int(t), o, h, lo, c, v)
            for t, o, h, lo, c, v in zip(times, *(vals[k] for k in _OHLCV), strict=True)
        )
        out[sym] = rows
    return out
