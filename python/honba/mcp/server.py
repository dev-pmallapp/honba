"""MCP server exposing honba's research tools to AI agents (needs the ``mcp`` extra).

``python -m honba.mcp`` runs it over stdio; ``$HONBA_HOME`` (or ``--home``) is the sandbox
directory. The tool logic lives in :mod:`honba.mcp.tools` and works without the MCP SDK.
"""

from __future__ import annotations

import argparse
from collections.abc import Callable
from pathlib import Path
from typing import Any

from .tools import HonbaTools

__all__ = ["HonbaMCPServer", "main"]

INSTRUCTIONS = (
    "honba research tools for Indian markets. Workflow: import_data -> write_strategy -> "
    "run_backtest -> get_report; run_sweep then overfit_audit before trusting a tuned strategy. "
    "Strategies are honba.Strategy subclasses; only honba / numpy / pandas / stdlib math imports "
    "are accepted and files never leave the sandbox."
)


def _server_class() -> Any:
    """The MCP SDK server class (mcp >= 2 ``MCPServer``, mcp 1.x ``FastMCP``), imported lazily."""
    try:
        from mcp.server.mcpserver import MCPServer

        return MCPServer
    except ImportError:
        pass
    try:
        from mcp.server.fastmcp import FastMCP

        return FastMCP
    except ImportError:
        raise RuntimeError(
            "the MCP server needs the official SDK: pip install 'honba[mcp]'"
        ) from None


class HonbaMCPServer:
    """Wire :class:`HonbaTools` into an MCP server (SDK imported only when :meth:`build` runs)."""

    def __init__(self, home: str | Path | None = None, *, tools: HonbaTools | None = None) -> None:
        self.tools = tools or HonbaTools(home)

    @property
    def functions(self) -> dict[str, Callable[..., dict[str, Any]]]:
        """Tool name -> plain callable."""
        return self.tools.tool_functions

    def build(self) -> Any:
        """Create the MCP server object with every tool registered."""
        app = _server_class()("honba", instructions=INSTRUCTIONS)
        for name, fn in self.functions.items():
            app.tool(name=name)(fn)
        return app

    def run(self, transport: str = "stdio") -> None:
        """Serve until the client disconnects."""
        self.build().run(transport)


def main(argv: list[str] | None = None) -> None:
    """Console entry point: ``honba-mcp [--home DIR]``."""
    parser = argparse.ArgumentParser(prog="honba-mcp", description="honba MCP server (stdio)")
    parser.add_argument("--home", help="sandbox directory (default $HONBA_HOME or ~/.honba)")
    args = parser.parse_args(argv)
    HonbaMCPServer(args.home).run()
