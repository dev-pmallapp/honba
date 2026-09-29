"""Bar history: growable numpy buffers and the read-only ``Bars`` view handed to strategies."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING

import numpy as np

from .types import IST, Bar

if TYPE_CHECKING:
    import pandas as pd

__all__ = ["BarBuffer", "Bars"]

_IST_MS = 19_800_000  # UTC+05:30
_COLS = ("time_ms", "open", "high", "low", "close", "volume")


class Bars:
    """Read-only, zero-copy view of closed bars, oldest first.

    Column attributes are numpy arrays (``bars.close[-20:].mean()``); ``bars[-1]`` is a
    :class:`Bar`; slices return ``Bars``. A view never grows: strategies get a fresh one each
    bar, so it can never show a bar that has not closed yet.
    """

    __slots__ = ("close", "high", "low", "open", "time_ms", "volume")

    def __init__(self, cols: dict[str, np.ndarray]) -> None:
        for name in _COLS:
            arr = cols[name]
            arr.flags.writeable = False
            setattr(self, name, arr)

    def __len__(self) -> int:
        return len(self.time_ms)

    def __bool__(self) -> bool:
        return len(self) > 0

    def __getitem__(self, item: int | slice) -> Bar | Bars:
        if isinstance(item, slice):
            return Bars({name: getattr(self, name)[item] for name in _COLS})
        return Bar(
            int(self.time_ms[item]),
            float(self.open[item]),
            float(self.high[item]),
            float(self.low[item]),
            float(self.close[item]),
            float(self.volume[item]),
        )

    def __iter__(self):
        for i in range(len(self)):
            yield self[i]

    @property
    def last(self) -> Bar:
        """The most recent closed bar."""
        if not len(self):
            raise IndexError("no bars yet")
        return self[-1]  # type: ignore[return-value]

    @property
    def hl2(self) -> np.ndarray:
        """Median price ``(high + low) / 2``."""
        return (self.high + self.low) / 2.0

    @property
    def hlc3(self) -> np.ndarray:
        """Typical price ``(high + low + close) / 3``."""
        return (self.high + self.low + self.close) / 3.0

    @property
    def sessions(self) -> np.ndarray:
        """IST trading date ordinal of every bar (group key for session-anchored maths)."""
        return (self.time_ms + _IST_MS) // 86_400_000

    def to_frame(self) -> pd.DataFrame:
        """Copy into a DataFrame indexed by IST open time."""
        import pandas as pd

        index = pd.to_datetime(self.time_ms, unit="ms", utc=True).tz_convert(IST)
        return pd.DataFrame({n: getattr(self, n) for n in _COLS[1:]}, index=index.rename("time"))

    def __repr__(self) -> str:
        if not len(self):
            return "Bars(empty)"
        first = datetime.fromtimestamp(self.time_ms[0] / 1000, UTC).astimezone(IST)
        last = self.last.time
        return f"Bars(n={len(self)}, first={first:%Y-%m-%d %H:%M}, last={last:%Y-%m-%d %H:%M})"


class BarBuffer:
    """Append-only bar storage with amortised O(1) appends and O(1) read-only views."""

    def __init__(self, capacity: int = 1024) -> None:
        self._n = 0
        self._data = {name: np.empty(capacity, dtype=np.float64) for name in _COLS}
        self._data["time_ms"] = np.empty(capacity, dtype=np.int64)

    def __len__(self) -> int:
        return self._n

    def append(self, bar: Bar) -> None:
        """Add a closed bar; timestamps must be strictly increasing."""
        if self._n and bar.time_ms <= self._data["time_ms"][self._n - 1]:
            raise ValueError("bars must be appended in strictly increasing time order")
        if self._n == len(self._data["time_ms"]):
            for name, arr in self._data.items():
                grown = np.empty(len(arr) * 2, dtype=arr.dtype)
                grown[: self._n] = arr[: self._n]
                self._data[name] = grown
        i = self._n
        d = self._data
        d["time_ms"][i] = bar.time_ms
        d["open"][i], d["high"][i], d["low"][i] = bar.open, bar.high, bar.low
        d["close"][i], d["volume"][i] = bar.close, bar.volume
        self._n += 1

    def view(self) -> Bars:
        """Read-only view of everything appended so far."""
        return Bars({name: arr[: self._n].view() for name, arr in self._data.items()})
