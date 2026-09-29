"""MCP tool logic (plain functions, no MCP SDK needed) and the strategy sandbox guard."""
# ruff: noqa: D103

from __future__ import annotations

import json

import httpx
import pandas as pd
import pytest
from honba.mcp import (
    HonbaMCPServer,
    HonbaTools,
    StrategySourceError,
    check_strategy_source,
    register_overfit_backend,
)
from sdk_helpers import trending

import honba as hb
from honba.data import DhanCredentials, DhanLoader, DhanSecurity

GOOD = '''
import honba as hb


class Momo(hb.Strategy):
    """Buy above the slow SMA, exit below."""

    timeframe = "1d"
    slow = hb.Param(10, low=3, high=30)

    def on_bar(self, ctx):
        close = self.history().close
        if len(close) < self.slow + 1:
            return
        sma = hb.ta.sma(close, self.slow)
        if self.position.is_flat and close[-1] > sma:
            self.buy(10)
        elif self.position.is_long and close[-1] < sma:
            self.close()
'''


@pytest.fixture
def tools(tmp_path):
    t = HonbaTools(tmp_path / "home")
    frame = trending(120).rename(columns={"time": "date"})
    frame.to_csv(t.ws.imports / "sbin.csv", index=False)
    t.import_data("SBIN", "1d", "csv", "sbin.csv")
    return t


def test_import_and_list(tools):
    out = tools.list_instruments()
    assert out["datasets"][0]["symbol"] == "SBIN" and out["datasets"][0]["rows"] == 120
    assert out["master_loaded"] is False


def test_import_is_sandboxed(tools, tmp_path):
    secret = tmp_path / "secret.csv"
    secret.write_text("date,open,high,low,close\n")
    for bad in (str(secret), "../../secret.csv", "../home/../../secret.csv"):
        with pytest.raises((ValueError, FileNotFoundError)):
            tools.import_data("X", "1d", "csv", bad)
    with pytest.raises(ValueError):
        tools.import_data("X", "1d", "csv", None)
    with pytest.raises(ValueError):
        tools.import_data("X", "1d", "ftp", "a")


def test_import_rejects_invalid_candles(tools):
    (tools.ws.imports / "bad.csv").write_text("date,open,high,low,close\n2024-01-01,10,5,9,10\n")
    with pytest.raises(hb.CandleValidationError):
        tools.import_data("BAD", "1d", "csv", "bad.csv")


def test_import_dhan_uses_injected_loader(tmp_path):
    def handler(req):
        body = {
            "open": [10.0], "high": [11.0], "low": [9.0], "close": [10.0],
            "volume": [1], "timestamp": [1704133800],
        }  # fmt: skip
        return httpx.Response(200, json=body)

    def factory(master):
        return DhanLoader(
            DhanCredentials("1", "t"),
            securities={"SBIN": DhanSecurity("3045")},
            client=httpx.Client(transport=httpx.MockTransport(handler)),
            min_interval=0,
        )

    t = HonbaTools(tmp_path, dhan_loader=factory)
    out = t.import_data("SBIN", "1d", "dhan", start="2024-01-02", end="2024-01-02")
    assert out["added"] == 1
    with pytest.raises(ValueError):
        t.import_data("SBIN", "1d", "dhan")


def test_write_strategy_and_run_backtest_report(tools):
    saved = tools.write_strategy("momo", GOOD)
    assert saved["class"] == "Momo" and saved["params"]["slow"]["default"] == 10
    assert tools.list_strategies() == {"strategies": ["momo"]}
    run = tools.run_backtest("momo", ["SBIN"], "1d", params={"slow": 8})
    assert run["run_id"].startswith("bt-") and "net_pnl" in run["summary"]
    json.dumps(run)  # strictly JSON
    report = tools.get_report(run["run_id"], max_trades=3)
    assert report["strategy"] == "momo" and report["params"]["slow"] == 8
    assert len(report["trades"]) <= 3 and report["total_trades"] >= 0
    assert report["metrics"]["total_trades"] == run["total_trades"]
    # a fresh instance reads the persisted report
    again = HonbaTools(tools.ws.root).get_report(run["run_id"], include_trades=False)
    assert again["trades"] == [] and again["summary"]["net_pnl"] == run["summary"]["net_pnl"]
    with pytest.raises(ValueError):
        tools.get_report("../../etc/passwd")
    with pytest.raises(KeyError):
        tools.get_report("bt-20240101T000000-deadbeef")


def test_run_backtest_errors(tools):
    with pytest.raises(FileNotFoundError):
        tools.run_backtest("nope", ["SBIN"], "1d")
    tools.write_strategy("momo", GOOD)
    with pytest.raises(KeyError):
        tools.run_backtest("momo", ["INFY"], "1d")
    with pytest.raises(ValueError, match="unsupported config"):
        tools.run_backtest("momo", ["SBIN"], "1d", config={"engine": "x"})
    with pytest.raises(ValueError):
        tools.run_backtest("../momo", ["SBIN"], "1d")


def test_corporate_action_adjustment_flag(tools):
    tools.write_strategy("momo", GOOD)
    with pytest.raises(FileNotFoundError):
        tools.run_backtest("momo", ["SBIN"], "1d", adjust_corporate_actions=True)
    (tools.ws.imports / "actions.csv").write_text(
        "symbol,ex_date,action,ratio\nSBIN,2024-03-01,split,2\n"
    )
    tools.run_backtest("momo", ["SBIN"], "1d", adjust_corporate_actions=True)


def test_sweep_and_overfit_hook(tools):
    tools.write_strategy("momo", GOOD)
    out = tools.run_sweep("momo", ["SBIN"], "1d", {"slow": [5, 10, 15]}, top=2)
    assert out["n_trials"] == 3 and len(out["top"]) == 2
    audit = tools.overfit_audit(out["run_id"])
    assert audit == {
        "run_id": out["run_id"],
        "available": False,
        "n_trials": 3,
        "message": "no DSR / PBO backend is installed in this honba version",
    }
    seen = {}

    def backend(frame: pd.DataFrame):
        seen["trials"] = frame.attrs["n_trials"]
        return {"dsr": 0.9, "pbo": 0.1}

    register_overfit_backend(backend)
    try:
        got = tools.overfit_audit(out["run_id"])
        assert got["available"] and got["dsr"] == 0.9 and seen["trials"] == 3
        # works from the persisted report too
        fresh = HonbaTools(tools.ws.root).overfit_audit(out["run_id"])
        assert fresh["pbo"] == 0.1
    finally:
        register_overfit_backend(None)
    with pytest.raises(ValueError):
        tools.overfit_audit("bt-20240101T000000-deadbeef")


def test_sweep_grid_is_capped(tools):
    tools.write_strategy("momo", GOOD)
    capped = HonbaTools(tools.ws, max_sweep=4)
    with pytest.raises(ValueError, match=r"5 combinations.*limit is 4"):
        capped.run_sweep("momo", ["SBIN"], "1d", {"slow": [3, 5, 7, 9, 11]})
    with pytest.raises(ValueError, match="list of values"):
        capped.run_sweep("momo", ["SBIN"], "1d", {"slow": "35"})
    assert capped.run_sweep("momo", ["SBIN"], "1d", {"slow": [5, 10]})["n_trials"] == 2
    with pytest.raises(ValueError, match="combinations"):  # default grid of the Param (5)
        capped.run_sweep("momo", ["SBIN"], "1d")
    with pytest.raises(ValueError, match="limit is 500"):
        tools.run_sweep("momo", ["SBIN"], "1d", {"slow": list(range(3, 31)) * 20})
    with pytest.raises(ValueError):
        HonbaTools(tools.ws, max_sweep=0)


def test_get_report_bounds_max_trades(tools):
    tools.write_strategy("momo", GOOD)
    run = tools.run_backtest("momo", ["SBIN"], "1d")
    for bad in (-1, 10**9, 1.5):
        with pytest.raises(ValueError, match="max_trades"):
            tools.get_report(run["run_id"], max_trades=bad)
    assert tools.get_report(run["run_id"], max_trades=0)["trades"] == []


@pytest.mark.parametrize(
    "snippet",
    [
        "import os",
        "import subprocess",
        "from os import path",
        "import honba.data",
        "from honba import data",
        "from honba.data import load_csv",
        "x = hb.data",
        "eval('1')",
        "exec('1')",
        "open('/etc/passwd')",
        "__import__('os')",
        "x = ().__class__",
        "pd.read_csv('/etc/passwd')",
        "np.load('x')",
        "getattr(hb, 'x')",
        "global g",
    ],
)
def test_sandbox_rejects_dangerous_code(snippet):
    code = "import honba as hb\nimport pandas as pd\nimport numpy as np\n"
    code += snippet + "\n\nclass S(hb.Strategy):\n    def on_bar(self, ctx):\n        pass\n"
    with pytest.raises(StrategySourceError):
        check_strategy_source(code)


_STRATEGY = "\n\nclass S(hb.Strategy):\n    def on_bar(self, ctx):\n        pass\n"
_PRELUDE = "import honba as hb\nimport pandas as pd\nimport numpy as np\n"


@pytest.mark.parametrize(
    "snippet",
    [
        # stdlib modules and dangerous names re-exported by allowed packages
        "from honba.research.report import Path",
        "from pandas.io.common import os",
        "from typing import sys",
        "from dataclasses import sys",
        "from honba.research.optimize import os as o2",
        "from numpy import ctypeslib",
        "from numpy import lib",
        "from honba import research",
        "from numpy import *",
        "import honba.research.report as r",
        "import numpy.lib",
        "x = hb.research.report.Path",
        "x = pd.io.common.os",
        "x = np.lib.npyio",
        "x = np.ctypeslib.ctypes",
        "hb.backtest",
        "from typing import get_type_hints",
        # modules used as values, imports rebound or monkeypatched, nested imports
        "m = np",
        "x = [pd]",
        "np = 1",
        "np.sum = abs",
        "del pd.DataFrame",
        "def f():\n    import math",
        # type / dunder / mro tricks
        "x = type(0).mro()",
        "x = type(0)",
        "x = int.mro()",
        "x = __builtins__",
        "x = (i for i in ()).gi_frame.f_back.f_globals",
        "x = (lambda: 0).__globals__",
        # format-string attribute / index access
        "s = '{0.__class__}'.format(1)",
        "s = '{0[0]}'.format([1])",
        "s = '{0:{1.real}}'.format(1, 2)",
        "t = '{0.real}'",
        "s = 'x'\nu = s.format(1)",
        "s = str.format('{}', 1)",
        # pandas string dispatch and I/O
        "pd.Series([1]).agg('to_pickle', '/tmp/x')",
        "name = 'sum'\npd.Series([1]).apply(name)",
        "pd.Series([1]).transform(func='to_csv')",
        "pd.DataFrame().to_csv('/tmp/x')",
        "pd.DataFrame().to_html('/tmp/x')",
        "pd.set_option('display.width', 1)",
        "pd.DataFrame().query('a > 1')",
        "np.save('x', 1)",
        # private attributes: only the strategy's own self._x
        "x = pd.Series([1])._mgr",
        "f = lambda self: self._mgr",
        "def g(self):\n    return self._x",
        "class T:\n    @staticmethod\n    def g(self):\n        return self._x",
    ],
)
def test_sandbox_rejects_escapes(snippet):
    with pytest.raises(StrategySourceError):
        check_strategy_source(_PRELUDE + snippet + _STRATEGY)


def test_sandbox_rejects_sdk_private_attributes():
    code = _PRELUDE + (
        "\n\nclass S(hb.Strategy):\n    def on_bar(self, ctx):\n        x = self._ctx\n"
    )
    with pytest.raises(StrategySourceError, match="private"):
        check_strategy_source(code)


LEGIT = """
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

import numpy as np
import pandas as pd

import honba as hb
from honba import Param, Strategy


@dataclass
class Box:
    value: float = 0.0


def double(v):
    return v * 2


class Legit(Strategy):
    timeframe = "1d"
    fast = Param(5, low=2, high=10)

    def __init__(self, **params: Any) -> None:
        super().__init__(**params)
        self._seen = 0
        self._rng = np.random.default_rng(0)

    def on_bar(self, ctx):
        self._seen += 1
        close = pd.Series(self.history().close)
        roll = close.rolling(self.fast).agg("mean")
        scaled = close.apply(lambda v: v / 2).transform(double).agg(["min", np.max])
        note = "{:.2f} {}".format(math.sqrt(2.0), len(scaled)) + f"{roll.iloc[-1]!r}"
        box = Box(float(hb.ta.sma(close.to_numpy(), 2)) if len(close) > 2 else 0.0)
        if self._rng.random() > 2 and note and box.value:
            self.buy(1)
"""


def test_sandbox_accepts_legitimate_strategies(tools):
    assert check_strategy_source(LEGIT) == "Legit"
    saved = tools.write_strategy("legit", LEGIT)
    assert saved["class"] == "Legit" and saved["params"]["fast"]["default"] == 5
    tools.run_backtest("legit", ["SBIN"], "1d")


def test_write_strategy_never_executes_code_in_process(tools, monkeypatch):
    import honba.mcp.sandbox as sandbox

    def boom(*_a, **_k):
        raise AssertionError("agent code executed in the server process")

    monkeypatch.setattr(sandbox, "compile_strategy", boom)
    saved = tools.write_strategy("momo", GOOD)
    assert saved["class"] == "Momo"


def test_write_strategy_isolated_load_errors_and_timeout(tools, monkeypatch):
    import honba.mcp.sandbox as sandbox

    with pytest.raises(StrategySourceError, match="ZeroDivisionError"):
        tools.write_strategy("div", "x = 1 / 0\n" + GOOD)
    monkeypatch.setattr(sandbox, "INTROSPECT_TIMEOUT", 3.0)
    with pytest.raises(StrategySourceError, match="longer than"):
        tools.write_strategy("spin", "while True:\n    pass\n" + GOOD)
    assert not (tools.ws.strategies / "div.py").exists()
    assert not (tools.ws.strategies / "spin.py").exists()


def test_sandbox_structure_rules(tools):
    with pytest.raises(StrategySourceError, match="exactly one"):
        check_strategy_source("import honba as hb\nx = 1\n")
    with pytest.raises(StrategySourceError, match="exactly one"):
        check_strategy_source(
            "import honba as hb\nclass A(hb.Strategy): pass\nclass B(hb.Strategy): pass\n"
        )
    with pytest.raises(StrategySourceError, match="syntax"):
        check_strategy_source("def (:")
    for name in ("../x", "a/b", "", "x.py", "1x"):
        with pytest.raises(StrategySourceError):
            tools.write_strategy(name, GOOD)
    assert list(tools.ws.strategies.iterdir()) == []  # nothing written on failure
    tools.write_strategy("a", GOOD)
    with pytest.raises(FileExistsError):
        tools.write_strategy("a", GOOD, overwrite=False)
    with pytest.raises(StrategySourceError):
        tools.write_strategy("bad", "import os\n" + GOOD)


def test_tampered_strategy_file_is_rechecked_on_run(tools):
    (tools.ws.strategies / "evil.py").write_text("import os\nimport honba as hb\n" + GOOD)
    with pytest.raises(StrategySourceError):
        tools.run_backtest("evil", ["SBIN"], "1d")


def test_server_registers_every_tool_without_sdk(tmp_path):
    server = HonbaMCPServer(tmp_path)
    assert set(server.functions) == {
        "import_data",
        "list_instruments",
        "list_strategies",
        "write_strategy",
        "run_backtest",
        "get_report",
        "run_sweep",
        "overfit_audit",
    }


def test_server_build_with_official_sdk(tmp_path):
    pytest.importorskip("mcp")
    app = HonbaMCPServer(tmp_path).build()
    assert app is not None
