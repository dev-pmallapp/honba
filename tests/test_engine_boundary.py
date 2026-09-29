"""The compiled engine is reachable from exactly one module (complements import-linter)."""
# ruff: noqa: D103

from __future__ import annotations

import ast
from pathlib import Path

import honba

ROOT = Path(honba.__file__).parent
ADAPTER = ROOT / "research" / "_barter_adapter.py"
ENGINE_FILES = {"_barter_adapter.py", "simple_engine.py"}
ENGINE_MODULE_NAMES = {"_barter_adapter", "simple_engine"}


def _imports(path: Path) -> set[str]:
    tree = ast.parse(path.read_text())
    found: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            found |= {a.name for a in node.names}
        elif isinstance(node, ast.ImportFrom):
            base = ("." * node.level) + (node.module or "")
            found.add(base)
            found |= {f"{base}.{a.name}" for a in node.names}
    return found


def test_only_the_barter_adapter_imports_the_compiled_engine():
    offenders = []
    for path in ROOT.rglob("*.py"):
        if path == ADAPTER:
            continue
        for name in _imports(path):
            if name.split(".")[-1] == "_core" or "honba._core" in name:
                offenders.append(f"{path.relative_to(ROOT)}: {name}")
    assert not offenders, offenders


def test_adapter_is_the_module_that_does_import_it():
    assert any(n.endswith("_core") for n in _imports(ADAPTER))


def test_neutral_layers_do_not_import_engine_modules():
    offenders = []
    paths = [*(ROOT / "strategy").rglob("*.py"), *(ROOT / "research").rglob("*.py")]
    for path in paths:
        if path.name in ENGINE_FILES:
            continue
        for name in _imports(path):
            if name.split(".")[-1].removesuffix(".py") in ENGINE_MODULE_NAMES:
                offenders.append(f"{path.relative_to(ROOT)}: {name}")
    assert not offenders, offenders


def test_strategy_layer_has_no_engine_wire_format_knowledge():
    for path in (ROOT / "strategy").rglob("*.py"):
        text = path.read_text()
        assert "from_dict" not in text and "to_wire" not in text, path.name
        assert "run_backtest" not in text, path.name
