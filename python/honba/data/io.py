"""Read candle files (CSV / Parquet) into the SDK candle schema."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pandas as pd

from ._frames import normalise_frame

__all__ = ["load_csv", "load_parquet"]


def load_csv(path: str | Path, *, sort: bool = True, **read_csv_kwargs: Any) -> pd.DataFrame:
    """Load a candle CSV as ``time open high low close volume`` (IST-aware ``time``).

    Header names are case-insensitive; ``time`` may also be called ``date`` / ``datetime`` /
    ``timestamp`` (ISO strings or epoch s / ms; naive means IST). Extra ``read_csv_kwargs`` go to
    :func:`pandas.read_csv` (e.g. ``sep=";"``). Duplicate times keep the last row.
    """
    frame = pd.read_csv(path, **read_csv_kwargs)
    return normalise_frame(frame, sort=sort)


def load_parquet(path: str | Path, *, sort: bool = True) -> pd.DataFrame:
    """Load a candle Parquet file in the SDK candle schema (see :func:`load_csv`)."""
    return normalise_frame(pd.read_parquet(path), sort=sort)
