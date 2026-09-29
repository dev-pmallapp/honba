"""Static guard and loader for agent-written strategy files.

Agents hand the MCP server strategy *source*. Before it is saved or executed it must pass
:func:`check_strategy_source`: only allow-listed imports, no ``eval`` / ``exec`` / ``open`` /
dunder tricks / file or network primitives, exactly one ``honba.Strategy`` subclass. This is a
best-effort guard against accidents and casual abuse, not a security boundary against a
determined adversary (run the server in a container for untrusted agents). Files only ever
live in, and are only ever loaded from, the workspace's strategies directory.
"""

from __future__ import annotations

import ast
import re
import types
from pathlib import Path

__all__ = [
    "MAX_SOURCE_BYTES",
    "StrategySourceError",
    "check_strategy_source",
    "compile_strategy",
    "safe_name",
    "strategy_path",
]

MAX_SOURCE_BYTES = 100_000
_NAME = re.compile(r"[A-Za-z_][A-Za-z0-9_]{0,63}")

ALLOWED_IMPORTS = frozenset(
    {
        "__future__",
        "honba",
        "numpy",
        "pandas",
        "math",
        "statistics",
        "datetime",
        "dataclasses",
        "typing",
        "collections",
        "itertools",
        "functools",
        "enum",
        "decimal",
    }
)
_BLOCKED_HONBA = ("data", "mcp", "cli", "server")  # I/O layers: strategies get candles, not files
_FORBIDDEN_NAMES = frozenset(
    {
        "eval",
        "exec",
        "compile",
        "open",
        "__import__",
        "input",
        "breakpoint",
        "globals",
        "locals",
        "vars",
        "getattr",
        "setattr",
        "delattr",
        "memoryview",
        "exit",
        "quit",
    }
)
_FORBIDDEN_ATTRS = frozenset(
    {
        "read_csv",
        "read_parquet",
        "read_pickle",
        "read_excel",
        "read_json",
        "read_html",
        "read_sql",
        "read_table",
        "read_feather",
        "read_hdf",
        "read_clipboard",
        "to_csv",
        "to_pickle",
        "to_parquet",
        "to_excel",
        "to_json",
        "to_hdf",
        "to_feather",
        "to_sql",
        "to_clipboard",
        "load",
        "loads",
        "save",
        "savez",
        "savetxt",
        "loadtxt",
        "genfromtxt",
        "fromfile",
        "tofile",
        "memmap",
        "eval",
        "system",
        "popen",
    }
)


class StrategySourceError(ValueError):
    """The strategy source or name is not acceptable."""


def safe_name(name: str) -> str:
    """Validate a strategy file / class name (identifier, no path parts)."""
    if not isinstance(name, str) or not _NAME.fullmatch(name):
        raise StrategySourceError(
            f"invalid strategy name {name!r}: use letters, digits and underscores (max 64)"
        )
    return name


def strategy_path(directory: Path, name: str) -> Path:
    """``directory/<name>.py``, guaranteed to be inside ``directory``."""
    directory = directory.resolve()
    path = (directory / f"{safe_name(name)}.py").resolve()
    if path.parent != directory:
        raise StrategySourceError("strategy path escapes the strategies directory")
    return path


def _blocked(module: str) -> bool:
    parts = module.split(".")
    return parts[0] == "honba" and len(parts) > 1 and parts[1] in _BLOCKED_HONBA


def _is_strategy_base(node: ast.expr) -> bool:
    if isinstance(node, ast.Name):
        return node.id == "Strategy"
    return isinstance(node, ast.Attribute) and node.attr == "Strategy"


def check_strategy_source(source: str) -> str:
    """Validate ``source`` and return the name of its single Strategy subclass."""
    if len(source.encode()) > MAX_SOURCE_BYTES:
        raise StrategySourceError(f"strategy source over {MAX_SOURCE_BYTES} bytes")
    try:
        tree = ast.parse(source)
    except SyntaxError as exc:
        raise StrategySourceError(f"syntax error line {exc.lineno}: {exc.msg}") from None
    problems: list[str] = []
    for node in ast.walk(tree):
        line = getattr(node, "lineno", 0)
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name.split(".")[0] not in ALLOWED_IMPORTS or _blocked(alias.name):
                    problems.append(f"line {line}: import of {alias.name!r} is not allowed")
        elif isinstance(node, ast.ImportFrom):
            root = (node.module or "").split(".")[0]
            module = node.module or ""
            names = [f"{module}.{a.name}" for a in node.names]
            if node.level or root not in ALLOWED_IMPORTS or any(map(_blocked, [module, *names])):
                problems.append(f"line {line}: import from {node.module!r} is not allowed")
        elif isinstance(node, ast.Name) and node.id in _FORBIDDEN_NAMES:
            problems.append(f"line {line}: use of {node.id!r} is not allowed")
        elif isinstance(node, ast.Attribute):
            if (
                node.attr in _BLOCKED_HONBA
                and isinstance(node.value, ast.Name)
                and node.value.id in ("hb", "honba")
            ):
                problems.append(f"line {line}: honba.{node.attr} is not available to strategies")
            dunder = node.attr.startswith("__") and node.attr not in ("__init__", "__post_init__")
            if dunder or node.attr in _FORBIDDEN_ATTRS:
                problems.append(f"line {line}: attribute {node.attr!r} is not allowed")
        elif isinstance(node, (ast.Global, ast.Nonlocal)):
            problems.append(f"line {line}: global / nonlocal is not allowed")
    if problems:
        raise StrategySourceError("; ".join(problems[:10]))
    classes = [
        n.name
        for n in tree.body
        if isinstance(n, ast.ClassDef) and any(_is_strategy_base(b) for b in n.bases)
    ]
    if len(classes) != 1:
        raise StrategySourceError(
            f"the file must define exactly one honba.Strategy subclass, found {len(classes)}"
        )
    return classes[0]


def compile_strategy(source: str, filename: str) -> type:
    """Check ``source``, execute it as a module and return its Strategy class."""
    import honba as hb  # local: keeps this module import-cheap and cycle-free

    class_name = check_strategy_source(source)
    module = types.ModuleType("honba_agent_strategy")
    module.__file__ = filename
    exec(compile(source, filename, "exec"), module.__dict__)  # guarded by check_strategy_source
    cls = module.__dict__.get(class_name)
    if not (isinstance(cls, type) and issubclass(cls, hb.Strategy)):
        raise StrategySourceError(f"{class_name} is not a honba.Strategy subclass")
    return cls
