"""Import smoke tests.

Cheap, and they would have caught every one of the following, all of which
were live in the skeleton before anyone ran it:

* ``honba/yosoku/retraining/scheduler.py.py`` and ``triggers.py.py`` —
  double file extensions, so the modules they were imported as did not exist
* ``RetrainingConfig`` used ``field(default_factory=list)`` without importing
  ``field`` from ``dataclasses`` -> ``NameError`` at import time
* ``RetrainingScheduler._check_and_retrain`` imported ``honba.yosoku.drift``,
  but the module was at ``honba/yosoku/retraining/drift.py``
* ``honba.yosoku.__init__`` imported ``RetrainingScheduler`` from
  ``...retraining.scheduler``, but the class is defined in
  ``...retraining.__init__`` and ``scheduler.py`` is empty

Keep these tests. A package that cannot be imported cannot be wrong in
interesting ways.
"""

from __future__ import annotations

import importlib
import pkgutil

import pytest

import honba

# The five top-level packages. If this list needs editing, the 20-package
# kanji layout is growing back; see docs/research/build-vs-extend.md §7.
TOP_LEVEL = [
    "honba.api",
    "honba.cli",
    "honba.data",
    "honba.research",
    "honba.strategies",
]


@pytest.mark.parametrize("name", TOP_LEVEL)
def test_top_level_packages_import(name: str) -> None:
    importlib.import_module(name)


def test_every_submodule_imports() -> None:
    """Recursively import everything under ``honba``.

    This is the test that catches ``.py.py``, missing imports, and stale
    module paths after a refactor.
    """
    failures: list[str] = []
    for mod in pkgutil.walk_packages(honba.__path__, prefix="honba."):
        try:
            importlib.import_module(mod.name)
        except Exception as exc:  # noqa: BLE001 - we want to report all of them
            failures.append(f"{mod.name}: {type(exc).__name__}: {exc}")

    assert not failures, "modules failed to import:\n  " + "\n  ".join(failures)


def test_no_py_py_files() -> None:
    """Guard against the double-extension mistake recurring."""
    root = __import__("pathlib").Path(honba.__path__[0])
    offenders = [str(p) for p in root.rglob("*.py.py")]
    assert not offenders, f"files with double .py extension: {offenders}"


def test_research_layer_does_not_import_nautilus() -> None:
    """The rc-churn firewall, spot-checked at runtime.

    The authoritative check is the import-linter contract in pyproject.toml
    (``lint-imports``); this is a fast fail-early duplicate so a plain
    ``pytest`` run surfaces the same breach.
    """
    import sys

    for mod in ("honba.research", "honba.research.ml"):
        importlib.import_module(mod)

    leaked = [
        name
        for name in sys.modules
        if name.startswith("honba.research") and name.endswith("_nautilus_adapter")
    ]
    # Importing the research package must not pull in the adapter, and
    # therefore must not pull in nautilus_trader.
    assert not leaked, f"adapter eagerly imported by research package: {leaked}"
