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
