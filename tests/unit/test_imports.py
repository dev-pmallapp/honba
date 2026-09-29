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

# The top-level packages of the Python SDK (``python/honba``). If this list
# needs editing, the 20-package kanji layout is growing back; see
# docs/research/build-vs-extend.md §7.
TOP_LEVEL = [
    "honba.cli",
    "honba.mcp",
    "honba.research",
    "honba.server",
    "honba.strategy",
]


# Packages that still only exist in the legacy root ``honba/`` tree, which
# ``python/honba`` shadows. Modules that import them cannot load until that
# code is moved into ``python/honba``.
LEGACY_ROOT_PACKAGES = {"honba.api", "honba.data", "honba.strategies"}


@pytest.mark.parametrize("name", TOP_LEVEL)
def test_top_level_packages_import(name: str) -> None:
    try:
        importlib.import_module(name)
    except ModuleNotFoundError as exc:
        if exc.name in LEGACY_ROOT_PACKAGES:
            pytest.skip(f"{name} needs legacy root package {exc.name} (not in python/honba)")
        raise


def test_every_submodule_imports() -> None:
    """Recursively import everything under ``honba``.

    This is the test that catches ``.py.py``, missing imports, and stale
    module paths after a refactor.
    """
    failures: list[str] = []
    for mod in pkgutil.walk_packages(honba.__path__, prefix="honba."):
        try:
            importlib.import_module(mod.name)
        except ModuleNotFoundError as exc:
            if exc.name not in LEGACY_ROOT_PACKAGES:
                failures.append(f"{mod.name}: {type(exc).__name__}: {exc}")
        except Exception as exc:  # noqa: BLE001 - we want to report all of them
            failures.append(f"{mod.name}: {type(exc).__name__}: {exc}")

    assert not failures, "modules failed to import:\n  " + "\n  ".join(failures)


def test_no_py_py_files() -> None:
    """Guard against the double-extension mistake recurring."""
    root = __import__("pathlib").Path(honba.__path__[0])
    offenders = [str(p) for p in root.rglob("*.py.py")]
    assert not offenders, f"files with double .py extension: {offenders}"


def test_research_layer_does_not_load_engine_adapter() -> None:
    """Importing the SDK must not eagerly pull in the engine adapter or ``_core``.

    The authoritative check is the import-linter contracts in pyproject.toml
    (``make lint-imports``); this is a fast fail-early duplicate. It runs in a
    fresh interpreter because other tests legitimately load the adapter.
    """
    import os
    import pathlib
    import subprocess
    import sys

    code = (
        "import sys, honba.research, honba.strategy\n"
        "leaked = [m for m in sys.modules "
        "if m.endswith('_barter_adapter') or m == 'honba._core']\n"
        "print(leaked)\n"
        "sys.exit(1 if leaked else 0)\n"
    )
    sdk_root = str(pathlib.Path(honba.__path__[0]).parent)
    env = {**os.environ, "PYTHONPATH": sdk_root}
    proc = subprocess.run(
        [sys.executable, "-c", code],
        capture_output=True,
        text=True,
        check=False,
        env=env,
        cwd=sdk_root,
    )
    assert proc.returncode == 0, f"engine modules eagerly imported: {proc.stdout}{proc.stderr}"
