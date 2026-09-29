"""Declared, bounded strategy parameters (discoverable by sweeps and optimisers)."""

from __future__ import annotations

import itertools
import math
import numbers
import random
from collections.abc import Iterator, Mapping, Sequence
from typing import Any

import numpy as np

__all__ = ["Param", "grid_of"]


class Param:
    """A tunable strategy parameter, declared as a class attribute.

    ::

        class Breakout(Strategy):
            lookback = Param(20, low=10, high=60, step=5)
            mode = Param("fast", choices=("fast", "slow"))

    The instance attribute holds the run's value. ``low``/``high`` bound numeric values
    (inclusive); ``step`` makes ``grid()`` deterministic; ``kind`` is inferred from ``default``.
    """

    def __init__(
        self,
        default: Any,
        *,
        low: float | None = None,
        high: float | None = None,
        step: float | None = None,
        choices: Sequence[Any] | None = None,
        description: str = "",
    ) -> None:
        self.default = default
        self.low = low
        self.high = high
        self.step = step
        self.choices = tuple(choices) if choices is not None else None
        self.description = description
        self.name = ""
        self.kind: type = type(default)
        if self.kind is bool or self.choices is not None:
            if low is not None or high is not None:
                raise ValueError("bool / choices params take no low/high")
        elif low is not None and high is not None and low > high:
            raise ValueError(f"low ({low}) must not exceed high ({high})")
        self.validate(default)

    def __set_name__(self, owner: type, name: str) -> None:
        self.name = name

    def __get__(self, instance: Any, owner: type | None = None) -> Any:
        if instance is None:
            return self
        return instance._param_values[self.name]

    def __set__(self, instance: Any, value: Any) -> None:
        raise AttributeError(f"parameter {self.name!r} is read-only during a run")

    def validate(self, value: Any) -> Any:
        """Coerce ``value`` to the parameter's kind and check bounds / choices."""
        if self.choices is not None:
            if value not in self.choices:
                raise ValueError(f"{self.name or 'param'}: {value!r} not in {self.choices}")
            return value
        if self.kind is bool:
            return bool(value)
        if self.kind in (int, float):
            label = self.name or "param"
            if isinstance(value, (bool, np.bool_)) or not isinstance(value, numbers.Real):
                raise ValueError(f"{label}: expected a number, got {value!r}")
            if not math.isfinite(value):
                raise ValueError(f"{label}: must be finite, got {value!r}")
            if self.kind is int:
                if not float(value).is_integer():
                    raise ValueError(f"{label}: expected an integer, got {value!r}")
                value = int(value)
            else:
                value = float(value)
            if self.low is not None and value < self.low:
                raise ValueError(f"{label}: {value} is below low={self.low}")
            if self.high is not None and value > self.high:
                raise ValueError(f"{label}: {value} is above high={self.high}")
        return value

    def grid(self, points: int = 5) -> list[Any]:
        """Return candidate values.

        ``choices`` when given, else ``low..high`` by ``step`` (or ``points`` evenly spaced).
        """
        if self.choices is not None:
            return list(self.choices)
        if self.kind is bool:
            return [False, True]
        if self.low is None or self.high is None:
            return [self.default]
        if self.step:
            n = int(round((self.high - self.low) / self.step, 9))
            values = [self.low + i * self.step for i in range(n + 1)]
        else:
            n = max(points - 1, 1)
            values = [self.low + (self.high - self.low) * i / n for i in range(n + 1)]
        if self.kind is int:
            return sorted({round(v) for v in values})
        return [round(v, 12) for v in values]

    def sample(self, rng: random.Random) -> Any:
        """A random valid value (for random search / Optuna-style optimisers)."""
        if self.choices is not None:
            return rng.choice(self.choices)
        if self.kind is bool:
            return rng.random() < 0.5
        if self.low is None or self.high is None:
            return self.default
        if self.kind is int:
            return rng.randint(int(self.low), int(self.high))
        return rng.uniform(self.low, self.high)

    def __repr__(self) -> str:
        bounds = f", low={self.low}, high={self.high}" if self.low is not None else ""
        return f"Param({self.default!r}{bounds})"


def grid_of(grid: Mapping[str, Sequence[Any]]) -> Iterator[dict[str, Any]]:
    """Cartesian product of a ``{name: values}`` grid as dicts."""
    keys = list(grid)
    for combo in itertools.product(*(list(grid[k]) for k in keys)):
        yield dict(zip(keys, combo, strict=True))
