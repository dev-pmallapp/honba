"""Static guard, isolated introspection and loader for agent-written strategy files.

Agents hand the MCP server strategy *source*. Before it is saved or executed it must pass
:func:`check_strategy_source`, an AST allowlist:

* imports only at module top level, only of the module paths in :data:`ALLOWED_MODULES`, and
  every imported name (and every attribute read off an imported module) is resolved against
  the real module: it must be on that module's explicit name allowlist (``honba`` and the
  stdlib modules) or, for numpy / pandas, be a public object *defined* inside numpy / pandas
  (so stdlib re-exports such as ``pandas.io.common.os`` or ``honba.research.report.Path`` are
  refused) that is not a known file / eval primitive. Module objects may only be used as the
  receiver of an attribute (``np.random.default_rng``), never passed around, rebound or
  assigned to;
* no ``eval`` / ``exec`` / ``open`` / ``type`` / ``getattr`` & co, no dunder names or
  attributes, no frame / code / generator introspection attributes (``gi_frame``,
  ``f_globals``, ``mro`` ...), no private attributes except the strategy's own ``self._x``;
* no ``str.format`` field access (``'{0.__class__}'``) and ``.format`` only on string literals;
* no pandas string dispatch to arbitrary methods (``s.agg("to_pickle", path)``);
* exactly one ``honba.Strategy`` subclass.

:func:`write_strategy` never executes agent code in the server process: after the static check
it introspects the class in a throw-away subprocess (:func:`introspect_strategy`) with a
stripped environment, a timeout and CPU / memory / file-size limits.

Residual risk: the static guard is defence in depth, not a security boundary. ``run_backtest``
and ``run_sweep`` execute the (re-checked) strategy in the server process, and Python offers
many indirect paths to the interpreter. Treat any agent that can call ``write_strategy`` as able
to run code as the server user; for untrusted agents run the server in a container / VM with no
credentials, a read-only filesystem outside ``$HONBA_HOME`` and no network.
"""

from __future__ import annotations

import ast
import contextlib
import functools
import importlib
import json
import os
import re
import string
import subprocess
import sys
import types
from collections.abc import Iterator
from pathlib import Path
from typing import Any

__all__ = [
    "ALLOWED_MODULES",
    "INTROSPECT_TIMEOUT",
    "MAX_SOURCE_BYTES",
    "StrategySourceError",
    "check_strategy_source",
    "compile_strategy",
    "introspect_strategy",
    "safe_name",
    "strategy_path",
]

MAX_SOURCE_BYTES = 100_000
INTROSPECT_TIMEOUT = 60.0  # seconds for the write-time introspection subprocess
_NAME = re.compile(r"[A-Za-z_][A-Za-z0-9_]{0,63}")

# honba names a strategy may use: the SDK surface minus the runners and engine registry.
_HONBA_NAMES = frozenset(
    {
        "CNC",
        "MIS",
        "MTF",
        "NRML",
        "Bar",
        "BarContext",
        "CancelReason",
        "CostModel",
        "EngineCapabilities",
        "Fill",
        "FillReason",
        "Instrument",
        "Leg",
        "Order",
        "OrderHandle",
        "Param",
        "PortfolioStrategy",
        "Position",
        "RejectReason",
        "RoundTrip",
        "Slippage",
        "Strategy",
        "TradingSession",
        "Trail",
        "UnsupportedFeature",
        "indicators",
        "split_order",
        "ta",
    }
)
_TYPING_UNSAFE = frozenset({"get_type_hints", "ForwardRef", "evaluate_forward_ref"})


def _public(module: str, *, exclude: frozenset[str] = frozenset()) -> frozenset[str]:
    mod = importlib.import_module(module)
    names = getattr(mod, "__all__", None) or [n for n in dir(mod) if not n.startswith("_")]
    return frozenset(n for n in names if not n.startswith("_")) - exclude


# Importable module paths. ``None`` = generic rule (public object defined in numpy / pandas /
# honba, not a known I/O or eval primitive); otherwise the explicit allowlist of names.
_MODULE_POLICY: dict[str, frozenset[str] | None] = {
    "__future__": frozenset({"annotations"}),
    "honba": _HONBA_NAMES,
    "honba.strategy.indicators": None,
    "numpy": None,
    "numpy.random": None,
    "numpy.linalg": None,
    "numpy.fft": None,
    "pandas": None,
    "pandas.tseries.offsets": None,
    "math": _public("math"),
    "statistics": _public("statistics"),
    "datetime": frozenset({"date", "datetime", "time", "timedelta", "timezone", "UTC"}),
    "dataclasses": _public("dataclasses"),
    "typing": _public("typing", exclude=_TYPING_UNSAFE),
    "collections": _public("collections"),
    "collections.abc": _public("collections.abc"),
    "itertools": _public("itertools"),
    "functools": _public("functools"),
    "enum": _public("enum"),
    "decimal": _public("decimal"),
}
ALLOWED_MODULES = frozenset(_MODULE_POLICY)

# Where objects reachable through the generic rule may be defined (``obj.__module__`` roots).
_OBJECT_ROOTS = frozenset({"numpy", "pandas", "honba", "typing", "__future__"})
_BLOCKED_PREFIXES = (
    "honba.data",
    "honba.mcp",
    "honba.cli",
    "honba.server",
    "honba.research",
    "pandas.io",
    "pandas.util",
    "pandas.plotting",
    "pandas.testing",
    "pandas.compat",
    "numpy.lib.npyio",
    "numpy.lib._npyio_impl",
    "numpy.lib.format",
    "numpy.testing",
    "numpy.ctypeslib",
    "numpy.f2py",
)
_FORBIDDEN_NAMES = frozenset(
    {
        "eval",
        "exec",
        "compile",
        "open",
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
        "help",
        "type",
    }
)
_FORBIDDEN_ATTRS = frozenset(
    {
        # file / network / serialisation / code evaluation in numpy and pandas
        "load",
        "loads",
        "save",
        "savez",
        "savez_compressed",
        "savetxt",
        "loadtxt",
        "genfromtxt",
        "fromfile",
        "fromregex",
        "tofile",
        "memmap",
        "DataSource",
        "ExcelWriter",
        "ExcelFile",
        "HDFStore",
        "eval",
        "query",
        "system",
        "popen",
        "set_option",
        "reset_option",
        "option_context",
        "describe_option",
        "options",
        "test",
        "info",
        "source",
        "show_config",
        "show_runtime",
        "get_include",
        "tearsheet",
        "savefig",
        "dump",
        "dumps",
    }
)
# Checked on every receiver, ``self`` included.
_ALWAYS_FORBIDDEN_ATTRS = frozenset(
    {
        # introspection: frames, code objects, generators, the MRO
        "mro",
        "f_globals",
        "f_locals",
        "f_builtins",
        "f_back",
        "f_code",
        "gi_frame",
        "gi_code",
        "cr_frame",
        "cr_code",
        "ag_frame",
        "ag_code",
        "tb_frame",
        "tb_next",
        "co_code",
        "cell_contents",
        "func_globals",
        # stdlib modules that other modules re-export as attributes
        "os",
        "sys",
        "io",
        "subprocess",
        "ctypes",
        "ctypeslib",
        "builtins",
        "importlib",
        "pathlib",
        "shutil",
        "socket",
        "pickle",
        "marshal",
        "inspect",
        "gc",
        "types",
        "lib",
        "compat",
        "util",
        "testing",
        "f2py",
    }
)
_FORBIDDEN_PREFIXES = ("read_", "write_", "to_")
_SAFE_TO = frozenset(
    {
        "to_numpy",
        "to_list",
        "to_dict",
        "to_frame",
        "to_series",
        "to_datetime",
        "to_timedelta",
        "to_numeric",
        "to_records",
        "to_period",
        "to_timestamp",
        "to_pydatetime",
        "to_pytimedelta",
        "to_offset",
        "to_flat_index",
        "to_datetime64",
        "to_timedelta64",
        "to_julian_date",
        "to_tuples",
        "to_integral_value",
        "to_integral",
        "to_eng_string",
    }
)
# pandas methods that turn a string argument into ``getattr(obj, name)(*args)``.
_DISPATCH_METHODS = frozenset({"agg", "aggregate", "apply", "transform"})
_SAFE_DISPATCH = frozenset(
    {
        "sum",
        "mean",
        "median",
        "min",
        "max",
        "std",
        "var",
        "sem",
        "count",
        "size",
        "nunique",
        "first",
        "last",
        "prod",
        "skew",
        "kurt",
        "all",
        "any",
        "abs",
        "cumsum",
        "cumprod",
        "cummax",
        "cummin",
        "idxmin",
        "idxmax",
        "rank",
        "diff",
        "pct_change",
        "shift",
        "ohlc",
        "quantile",
    }
)
_NAMED = (
    ast.FunctionDef,
    ast.AsyncFunctionDef,
    ast.ClassDef,
    ast.ExceptHandler,
    ast.MatchAs,
    ast.MatchStar,
)
_OK_DUNDERS = frozenset({"__init__", "__post_init__"})
_SELF = frozenset({"self", "cls"})


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


@functools.cache
def _sdk_private_names() -> frozenset[str]:
    """Private attribute names the SDK itself uses on strategies (never reachable by agents)."""
    root = Path(__file__).resolve().parent.parent
    names: set[str] = set()
    for folder in ("strategy", "research"):
        for file in (root / folder).glob("*.py"):
            try:
                tree = ast.parse(file.read_text(encoding="utf-8"))
            except (OSError, SyntaxError):
                continue
            names.update(
                n.attr
                for n in ast.walk(tree)
                if isinstance(n, ast.Attribute) and n.attr.startswith("_")
            )
    return frozenset(names)


def _is_dunder(name: str) -> bool:
    return name.startswith("__")


def _bad_attr_name(name: str, *, own: bool = False) -> bool:
    """I/O, eval and introspection attribute names (``own``: the receiver is ``self``/``cls``)."""
    if name in _ALWAYS_FORBIDDEN_ATTRS:
        return True
    if own:
        return False
    if name in _FORBIDDEN_ATTRS:
        return True
    return name.startswith(_FORBIDDEN_PREFIXES) and name not in _SAFE_TO


def _object_module(obj: Any) -> str:
    module = getattr(obj, "__module__", None)
    if not isinstance(module, str):
        module = type(obj).__module__
    return module


def _member_problem(module: str, name: str) -> tuple[str | None, Any]:
    """Resolve ``module.name``; return ``(problem, value)``."""
    if name.startswith("_"):
        return f"{module}.{name} is private", None
    policy = _MODULE_POLICY[module]
    if policy is not None and name not in policy:
        return f"{module}.{name} is not on the allowlist", None
    if name in _FORBIDDEN_NAMES or _bad_attr_name(name):
        return f"{module}.{name} is not allowed", None
    mod = importlib.import_module(module)
    try:
        value = getattr(mod, name)
    except AttributeError:
        return f"{module} has no attribute {name!r}", None
    if isinstance(value, types.ModuleType):
        if value.__name__ not in ALLOWED_MODULES:
            return f"module {value.__name__} is not available to strategies", None
        return None, value
    if policy is None and not isinstance(value, (bool, int, float, complex, str, type(None))):
        where = _object_module(value)
        if where.split(".")[0] not in _OBJECT_ROOTS or where.startswith(_BLOCKED_PREFIXES):
            return f"{module}.{name} (defined in {where}) is not available to strategies", None
    return None, value


def _format_fields(text: str) -> Iterator[str]:
    try:
        parsed = list(string.Formatter().parse(text))
    except ValueError:
        return
    for _, field, spec, _ in parsed:
        if field is not None:
            yield field
        if spec:
            yield from _format_fields(spec)


class _Checker:
    """One pass over a parsed strategy module, collecting problems."""

    def __init__(self, tree: ast.Module) -> None:
        self.tree = tree
        self.problems: list[str] = []
        self.bindings: dict[str, Any] = {}  # import-bound name -> module / object
        self.parents: dict[int, ast.AST] = {}
        for parent in ast.walk(tree):
            for child in ast.iter_child_nodes(parent):
                self.parents[id(child)] = parent

    def bad(self, node: ast.AST, message: str) -> None:
        self.problems.append(f"line {getattr(node, 'lineno', 0)}: {message}")

    # -- imports ----------------------------------------------------------------------------
    def imports(self) -> None:
        for node in ast.walk(self.tree):
            if not isinstance(node, (ast.Import, ast.ImportFrom)):
                continue
            if node not in self.tree.body:
                self.bad(node, "imports are only allowed at module top level")
                continue
            if isinstance(node, ast.Import):
                for alias in node.names:
                    if alias.name not in ALLOWED_MODULES:
                        self.bad(node, f"import of {alias.name!r} is not allowed")
                        continue
                    if alias.asname:
                        self.bind(node, alias.asname, importlib.import_module(alias.name))
                    else:
                        top = alias.name.split(".")[0]
                        self.bind(node, top, importlib.import_module(top))
                continue
            module = node.module or ""
            if node.level or module not in ALLOWED_MODULES:
                self.bad(node, f"import from {module!r} is not allowed")
                continue
            for alias in node.names:
                if alias.name == "*":
                    self.bad(node, "star imports are not allowed")
                    continue
                if module == "__future__":
                    if alias.name not in _MODULE_POLICY["__future__"]:  # type: ignore[operator]
                        self.bad(node, f"from __future__ import {alias.name} is not allowed")
                    continue
                problem, value = _member_problem(module, alias.name)
                if problem:
                    self.bad(node, f"import of {problem}")
                else:
                    self.bind(node, alias.asname or alias.name, value)

    def bind(self, node: ast.AST, name: str, value: Any) -> None:
        if name in self.bindings and self.bindings[name] is not value:
            self.bad(node, f"{name!r} is imported twice")
        self.bindings[name] = value

    # -- bindings ---------------------------------------------------------------------------
    def bound_names(self) -> Iterator[tuple[ast.AST, str]]:
        """Every name bound by the module other than by an import."""
        for node in ast.walk(self.tree):
            if isinstance(node, ast.Name) and isinstance(node.ctx, (ast.Store, ast.Del)):
                yield node, node.id
            elif isinstance(node, ast.arg):
                yield node, node.arg
            elif isinstance(node, _NAMED) and node.name:
                yield node, node.name
            elif isinstance(node, ast.MatchMapping) and node.rest:
                yield node, node.rest

    def self_ok(self, node: ast.arg) -> bool:
        """``self`` / ``cls`` may only be the first parameter of a method in a class body."""
        args = self.parents.get(id(node))
        func = self.parents.get(id(args)) if args is not None else None
        if not isinstance(func, (ast.FunctionDef, ast.AsyncFunctionDef)):
            return False
        if not isinstance(self.parents.get(id(func)), ast.ClassDef):
            return False
        first = (func.args.posonlyargs + func.args.args)[:1]
        static = any(
            isinstance(d, ast.Name) and d.id == "staticmethod" for d in func.decorator_list
        )
        return bool(first) and first[0] is node and not static

    def rebinding(self) -> None:
        for node, name in self.bound_names():
            if name in self.bindings:
                self.bad(node, f"{name!r} is an import and cannot be rebound")
            is_def = isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
            if _is_dunder(name) and name not in _OK_DUNDERS and not is_def:
                self.bad(node, f"name {name!r} is not allowed")
            if name in _SELF and not (isinstance(node, ast.arg) and self.self_ok(node)):
                self.bad(node, f"{name!r} may only be a method's first parameter")

    # -- expressions ------------------------------------------------------------------------
    def chain(self, node: ast.Attribute) -> tuple[ast.Name | None, list[str]]:
        attrs: list[str] = []
        cur: ast.expr = node
        while isinstance(cur, ast.Attribute):
            attrs.append(cur.attr)
            cur = cur.value
        attrs.reverse()
        return (cur if isinstance(cur, ast.Name) else None), attrs

    def is_receiver(self, node: ast.AST) -> bool:
        parent = self.parents.get(id(node))
        return isinstance(parent, ast.Attribute) and parent.value is node

    def resolve(self, node: ast.Attribute) -> None:
        """Walk ``alias.a.b`` through real modules while the value is a module."""
        root, attrs = self.chain(node)
        if root is None or root.id not in self.bindings:
            return
        value = self.bindings[root.id]
        for attr in attrs:
            if not isinstance(value, types.ModuleType):
                return
            name = value.__name__
            if name not in _MODULE_POLICY:
                self.bad(node, f"module {name} is not available to strategies")
                return
            problem, value = _member_problem(name, attr)
            if problem:
                self.bad(node, problem)
                return
        if isinstance(value, types.ModuleType) and not self.is_receiver(node):
            self.bad(node, "modules can only be used as attribute receivers")

    def attribute(self, node: ast.Attribute) -> None:
        attr = node.attr
        if _is_dunder(attr) and attr not in _OK_DUNDERS:
            self.bad(node, f"attribute {attr!r} is not allowed")
            return
        receiver = node.value
        own = isinstance(receiver, ast.Name) and receiver.id in _SELF
        if _bad_attr_name(attr, own=own):
            self.bad(node, f"attribute {attr!r} is not allowed")
            return
        private = attr.startswith("_") and attr not in _OK_DUNDERS
        if private and (not own or attr in _sdk_private_names()):
            self.bad(node, f"private attribute {attr!r} is not allowed")
            return
        literal = isinstance(receiver, ast.Constant) and isinstance(receiver.value, str)
        if attr in ("format", "format_map") and not literal:
            self.bad(node, f".{attr} is only allowed on a string literal")
        root, _ = self.chain(node)
        writes = isinstance(node.ctx, (ast.Store, ast.Del))
        if writes and root is not None and root.id in self.bindings:
            self.bad(node, f"cannot assign to attributes of the import {root.id!r}")
        self.resolve(node)

    def name(self, node: ast.Name) -> None:
        if node.id in _FORBIDDEN_NAMES:
            self.bad(node, f"use of {node.id!r} is not allowed")
        elif _is_dunder(node.id):
            self.bad(node, f"name {node.id!r} is not allowed")
        elif (
            isinstance(self.bindings.get(node.id), types.ModuleType)
            and isinstance(node.ctx, ast.Load)
            and not self.is_receiver(node)
        ):
            self.bad(node, f"module {node.id!r} can only be used as an attribute receiver")

    def constant(self, node: ast.Constant) -> None:
        if isinstance(node.value, str) and "{" in node.value:
            for field in _format_fields(node.value):
                if "." in field or "[" in field:
                    self.bad(node, f"format field {field!r} (attribute / index access)")

    def dispatch_arg(self, node: ast.expr, safe_funcs: set[str], methods: set[str]) -> bool:
        if isinstance(node, ast.Lambda):
            return True
        if isinstance(node, ast.Constant):
            return isinstance(node.value, str) and node.value in _SAFE_DISPATCH
        if isinstance(node, (ast.List, ast.Tuple)):
            return all(self.dispatch_arg(e, safe_funcs, methods) for e in node.elts)
        if isinstance(node, ast.Dict):
            return all(
                v is not None and self.dispatch_arg(v, safe_funcs, methods) for v in node.values
            )
        if isinstance(node, ast.Name):
            return node.id in safe_funcs or (
                node.id in self.bindings and callable(self.bindings[node.id])
            )
        if isinstance(node, ast.Attribute):
            root, attrs = self.chain(node)
            if root is None:
                return False
            if root.id in self.bindings:
                return True  # resolved and checked by :meth:`resolve`
            return root.id in _SELF and len(attrs) == 1 and attrs[0] in methods
        return False

    def dispatch(self, stored: set[str]) -> None:
        defs = {
            n.name
            for n in ast.walk(self.tree)
            if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))
        }
        methods = {
            f.name
            for c in ast.walk(self.tree)
            if isinstance(c, ast.ClassDef)
            for f in c.body
            if isinstance(f, (ast.FunctionDef, ast.AsyncFunctionDef))
        }
        assigned_self = {
            n.attr
            for n in ast.walk(self.tree)
            if isinstance(n, ast.Attribute) and not isinstance(n.ctx, ast.Load)
        }
        safe_funcs = defs - stored
        methods -= assigned_self
        for node in ast.walk(self.tree):
            if not (isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)):
                continue
            if node.func.attr not in _DISPATCH_METHODS:
                continue
            args = list(node.args[:1]) + [k.value for k in node.keywords if k.arg == "func"]
            starred = any(isinstance(a, ast.Starred) for a in node.args[:1]) or any(
                k.arg is None for k in node.keywords
            )
            if starred or not all(self.dispatch_arg(a, safe_funcs, methods) for a in args):
                self.bad(
                    node,
                    f".{node.func.attr}() takes a lambda, a function or one of the reductions "
                    f"{sorted(_SAFE_DISPATCH)[:6]}...",
                )

    def run(self) -> None:
        self.imports()
        self.rebinding()
        stored: set[str] = set()
        for node in ast.walk(self.tree):
            if isinstance(node, ast.Name) and not isinstance(node.ctx, ast.Load):
                stored.add(node.id)
            if isinstance(node, ast.Attribute):
                self.attribute(node)
            elif isinstance(node, ast.Name):
                self.name(node)
            elif isinstance(node, ast.Constant):
                self.constant(node)
            elif isinstance(node, (ast.Global, ast.Nonlocal)):
                self.bad(node, "global / nonlocal is not allowed")
        self.dispatch(stored)


def _is_strategy_base(node: ast.expr) -> bool:
    if isinstance(node, ast.Name):
        return node.id == "Strategy"
    return isinstance(node, ast.Attribute) and node.attr == "Strategy"


def check_strategy_source(source: str) -> str:
    """Validate ``source`` statically and return the name of its single Strategy subclass."""
    if not isinstance(source, str):
        raise StrategySourceError("strategy source must be a string")
    if len(source.encode()) > MAX_SOURCE_BYTES:
        raise StrategySourceError(f"strategy source over {MAX_SOURCE_BYTES} bytes")
    try:
        tree = ast.parse(source)
    except SyntaxError as exc:
        raise StrategySourceError(f"syntax error line {exc.lineno}: {exc.msg}") from None
    checker = _Checker(tree)
    checker.run()
    if checker.problems:
        unique = list(dict.fromkeys(checker.problems))
        raise StrategySourceError("; ".join(unique[:10]))
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
    """Check ``source``, execute it as a module *in this process* and return its Strategy class.

    Only for running a strategy (backtest / sweep); validation at write time goes through
    :func:`introspect_strategy`, which never executes agent code in the calling process.
    """
    import honba as hb  # local: keeps this module import-cheap and cycle-free

    class_name = check_strategy_source(source)
    module = types.ModuleType(f"honba_agent_strategy_{id(source):x}")
    module.__file__ = filename
    # dataclasses & co look the defining module up in sys.modules while the body runs
    sys.modules[module.__name__] = module
    try:
        exec(compile(source, filename, "exec"), module.__dict__)  # guarded by the static check
    finally:
        sys.modules.pop(module.__name__, None)
    cls = module.__dict__.get(class_name)
    if not (isinstance(cls, type) and issubclass(cls, hb.Strategy)):
        raise StrategySourceError(f"{class_name} is not a honba.Strategy subclass")
    return cls


_CHILD = r"""
import json, sys
sys.path.insert(0, sys.argv[1])
source = sys.stdin.read()
out = sys.stdout
sys.stdout = sys.stderr
try:
    from honba.mcp.sandbox import compile_strategy
    cls = compile_strategy(source, sys.argv[2])
    params = {
        k: {"default": p.default, "low": p.low, "high": p.high} for k, p in cls.params().items()
    }
    result = {"ok": True, "class": cls.__name__, "timeframe": getattr(cls, "timeframe", None),
              "params": params}
except BaseException as exc:
    result = {"ok": False, "error": f"{type(exc).__name__}: {exc}"[:2000]}
out.write("\n" + json.dumps(result, default=repr) + "\n")
out.flush()
"""


def _limit_child() -> None:  # pragma: no cover - runs in the forked child
    import resource

    cpu = int(INTROSPECT_TIMEOUT) + 1
    for limit, value in (
        (resource.RLIMIT_CPU, cpu),
        (resource.RLIMIT_AS, 4 << 30),
        (resource.RLIMIT_FSIZE, 0),
        (resource.RLIMIT_CORE, 0),
    ):
        with contextlib.suppress(ValueError, OSError):
            resource.setrlimit(limit, (value, value))


def introspect_strategy(source: str, filename: str) -> dict[str, Any]:
    """Statically check ``source``, then load it in an isolated subprocess.

    Returns ``{"class", "timeframe", "params"}``. The child runs ``python -I`` with a stripped
    environment (no credentials), in a temporary working directory, with a wall-clock timeout
    and CPU / address-space / file-size (zero: no file writes) limits on POSIX.
    """
    import tempfile

    check_strategy_source(source)
    package_parent = str(Path(__file__).resolve().parent.parent.parent)
    env = {"PATH": os.defpath, "OMP_NUM_THREADS": "1", "OPENBLAS_NUM_THREADS": "1"}
    with tempfile.TemporaryDirectory(prefix="honba-introspect-") as cwd:
        try:
            proc = subprocess.run(
                [sys.executable, "-I", "-c", _CHILD, package_parent, filename],
                input=source,
                capture_output=True,
                text=True,
                env=env,
                cwd=cwd,
                timeout=INTROSPECT_TIMEOUT,
                preexec_fn=_limit_child if os.name == "posix" else None,
                check=False,
            )
        except subprocess.TimeoutExpired:
            raise StrategySourceError(
                f"loading the strategy took longer than {INTROSPECT_TIMEOUT:g}s"
            ) from None
    lines = proc.stdout.strip().splitlines()
    try:
        result = json.loads(lines[-1]) if lines else None
    except ValueError:
        result = None
    if not isinstance(result, dict):
        tail = proc.stderr.strip().splitlines()[-3:]
        raise StrategySourceError(
            f"loading the strategy failed (exit {proc.returncode}): {' | '.join(tail)[:500]}"
        )
    if not result.get("ok"):
        raise StrategySourceError(f"loading the strategy failed: {result.get('error')}")
    return {k: result[k] for k in ("class", "timeframe", "params")}
