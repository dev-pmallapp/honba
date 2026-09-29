"""The only module in ``honba`` allowed to touch the barter-rs engine (``honba._core``)."""

from __future__ import annotations

import json
from collections.abc import Callable
from typing import Any

Candles = dict[str, list[tuple[int, float, float, float, float, float]]]
OnBar = Callable[[dict[str, Any]], list[dict[str, Any]]]


def run_backtest(config: dict[str, Any], candles: Candles, on_bar: OnBar) -> dict[str, Any]:
    """Run one backtest on the compiled engine and return the parsed report."""
    try:
        from honba import _core
    except ImportError as exc:  # pragma: no cover - depends on build
        raise RuntimeError(
            "honba._core is not built; run `maturin develop` to compile the barter engine"
        ) from exc
    report = _core.run_backtest(json.dumps(config), candles, on_bar)
    return json.loads(report) if isinstance(report, (str, bytes)) else dict(report)
