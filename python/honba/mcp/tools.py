"""MCP tool logic as plain functions on a :class:`Workspace` (testable without the MCP SDK).

Layout under the workspace root (``$HONBA_HOME``, default ``~/.honba``)::

    imports/        files agents may import from (CSV / Parquet, actions.csv)
    data/           the Parquet CandleStore
    strategies/     agent-written strategies (the only place code is loaded from)
    reports/        JSON reports of backtests and sweeps (``<run_id>.json``)
    instruments.csv Dhan scrip master (optional; enables list_instruments / lot sizes)
"""

from __future__ import annotations

import json
import math
import os
import re
import uuid
from collections.abc import Callable, Mapping, Sequence
from datetime import date, datetime
from pathlib import Path
from typing import Any

import pandas as pd

import honba as hb
from honba.data import (
    CandleStore,
    DhanLoader,
    InstrumentMaster,
    adjust_candles,
    load_actions_csv,
    load_csv,
    load_parquet,
)

from .sandbox import check_strategy_source, compile_strategy, strategy_path

__all__ = ["HonbaTools", "Workspace", "register_overfit_backend"]

_RUN_ID = re.compile(r"[a-z]+-\d{8}T\d{6}-[0-9a-f]{8}")
_CONFIG_KEYS = {
    "capital",
    "fill",
    "intrabar",
    "allow_short",
    "warmup_bars",
    "liquidate_at_end",
    "latency_ms",
    "start",
}
_OverfitBackend = Callable[[pd.DataFrame], Mapping[str, Any]]
_overfit_backend: _OverfitBackend | None = None


def register_overfit_backend(backend: _OverfitBackend | None) -> None:
    """Plug in the DSR / PBO audit: ``backend(sweep_frame) -> dict`` (``None`` unregisters).

    Without a registered backend :func:`overfit_audit` looks for ``honba.research.overfit_audit``
    or ``honba.overfit_audit`` (the sweep frame carries ``attrs["n_trials"]`` and
    ``attrs["results"]``) and otherwise reports what is missing.
    """
    global _overfit_backend
    _overfit_backend = backend


def _jsonable(value: Any) -> Any:
    if value is None or isinstance(value, (bool, str)):
        return value
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if isinstance(value, (int,)):
        return value
    if isinstance(value, (pd.Timestamp, datetime, date)):
        return value.isoformat()
    if isinstance(value, Mapping):
        return {str(k): _jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set, frozenset)):
        return [_jsonable(v) for v in value]
    if hasattr(value, "item"):  # numpy scalars
        return _jsonable(value.item())
    if hasattr(value, "__dataclass_fields__"):
        return _jsonable({f: getattr(value, f) for f in value.__dataclass_fields__})
    return str(value)


def _records(frame: pd.DataFrame, limit: int | None = None) -> list[dict[str, Any]]:
    if limit is not None:
        frame = frame.head(limit)
    return _jsonable(frame.reset_index(drop=True).to_dict(orient="records"))


class Workspace:
    """The sandbox directory all MCP file access is confined to."""

    def __init__(self, root: str | Path | None = None) -> None:
        self.root = Path(root or os.environ.get("HONBA_HOME") or Path.home() / ".honba")
        self.root = self.root.expanduser().resolve()
        self.imports = self.root / "imports"
        self.data = self.root / "data"
        self.strategies = self.root / "strategies"
        self.reports = self.root / "reports"
        for folder in (self.imports, self.data, self.strategies, self.reports):
            folder.mkdir(parents=True, exist_ok=True)

    @property
    def instruments_csv(self) -> Path:
        """Where the Dhan scrip master is expected."""
        return self.root / "instruments.csv"

    def import_path(self, relative: str) -> Path:
        """Resolve ``relative`` inside ``imports/`` (absolute paths and ``..`` are refused)."""
        path = (self.imports / relative).resolve()
        if not path.is_relative_to(self.imports) or path == self.imports:
            raise ValueError(f"{relative!r} is outside the imports directory")
        if not path.is_file():
            raise FileNotFoundError(f"no such file in imports/: {relative}")
        return path


class HonbaTools:
    """The MCP tools. Each public method is one tool; arguments and results are JSON-friendly."""

    def __init__(
        self,
        workspace: Workspace | str | Path | None = None,
        *,
        dhan_loader: Callable[[InstrumentMaster | None], Any] | None = None,
    ) -> None:
        self.ws = workspace if isinstance(workspace, Workspace) else Workspace(workspace)
        self.store = CandleStore(self.ws.data)
        self._dhan_loader = dhan_loader or (lambda master: DhanLoader(master=master))
        self._master: InstrumentMaster | None = None
        self._runs: dict[str, dict[str, Any]] = {}
        self._sweeps: dict[str, pd.DataFrame] = {}

    # -- helpers -----------------------------------------------------------------------------
    def master(self) -> InstrumentMaster | None:
        """The workspace instrument master, or ``None`` when ``instruments.csv`` is absent."""
        if self._master is None and self.ws.instruments_csv.is_file():
            self._master = InstrumentMaster.from_csv(self.ws.instruments_csv)
        return self._master

    def _run_id(self, kind: str) -> str:
        return f"{kind}-{datetime.now():%Y%m%dT%H%M%S}-{uuid.uuid4().hex[:8]}"

    def _save_report(self, run_id: str, payload: dict[str, Any]) -> None:
        (self.ws.reports / f"{run_id}.json").write_text(json.dumps(_jsonable(payload)))

    def _load_strategy(self, name: str) -> type:
        path = strategy_path(self.ws.strategies, name)
        if not path.is_file():
            raise FileNotFoundError(f"no strategy {name!r}; call write_strategy first")
        return compile_strategy(path.read_text(), str(path))

    def _candles(
        self,
        symbols: Sequence[str],
        timeframe: str,
        start: str | None,
        end: str | None,
        adjust: bool,
    ) -> dict[str, pd.DataFrame]:
        frames = self.store.load(list(symbols), timeframe, start, end)
        actions_file = self.ws.imports / "actions.csv"
        if adjust:
            if not actions_file.is_file():
                raise FileNotFoundError("adjust_corporate_actions needs imports/actions.csv")
            adjusted = adjust_candles(frames, load_actions_csv(actions_file))
            assert isinstance(adjusted, dict)
            frames = adjusted
        return frames

    def _config(
        self, config: Mapping[str, Any] | None, symbols: Sequence[str]
    ) -> hb.BacktestConfig:
        cfg = dict(config or {})
        unknown = set(cfg) - _CONFIG_KEYS - {"costs", "session"}
        if unknown:
            raise ValueError(
                f"unsupported config keys {sorted(unknown)}; use {sorted(_CONFIG_KEYS)}"
            )
        costs = cfg.pop("costs", "flat")
        if costs not in ("india", "flat"):
            raise ValueError("costs must be 'india' or 'flat'")
        cost_model = hb.CostModel.india() if costs == "india" else hb.CostModel.flat(0.0)
        session = hb.TradingSession() if cfg.pop("session", False) else None
        master = self.master()
        instruments = master.to_engine_instruments(symbols, strict=False) if master else {}
        return hb.BacktestConfig(costs=cost_model, session=session, instruments=instruments, **cfg)

    # -- tools -------------------------------------------------------------------------------
    def import_data(
        self,
        symbol: str,
        timeframe: str,
        source: str = "csv",
        path: str | None = None,
        start: str | None = None,
        end: str | None = None,
    ) -> dict[str, Any]:
        """Import candles into the store from ``imports/<path>`` (csv / parquet) or Dhan.

        ``source="dhan"`` needs ``start`` (and optionally ``end``) plus Dhan credentials in the
        server environment and the symbol in ``instruments.csv``.
        """
        if source in ("csv", "parquet"):
            if not path:
                raise ValueError("path (relative to imports/) is required")
            file = self.ws.import_path(path)
            frame = load_csv(file) if source == "csv" else load_parquet(file)
        elif source == "dhan":
            if not start:
                raise ValueError("start is required for source='dhan'")
            loader = self._dhan_loader(self.master())
            frame = loader.fetch(symbol, timeframe, start, end or datetime.now().date())
        else:
            raise ValueError("source must be csv, parquet or dhan")
        result = self.store.append(symbol, timeframe, frame)
        cover = self.store.coverage(symbol, timeframe)
        return _jsonable(
            {
                "symbol": symbol,
                "timeframe": timeframe,
                "added": result.added,
                "replaced": result.replaced,
                "total": result.total,
                "coverage": cover,
                "warnings": [f"[{i.kind}] {i.message}" for i in result.issues],
            }
        )

    def list_instruments(
        self, query: str = "", segment: str | None = None, limit: int = 20
    ) -> dict[str, Any]:
        """Search the instrument master (if loaded) and list the imported datasets."""
        datasets = [
            {"symbol": s, "timeframe": tf, **(self.store.coverage(s, tf) or {})}
            for s in self.store.symbols()
            for tf in self.store.timeframes(s)
        ]
        master = self.master()
        hits: list[dict[str, Any]] = []
        if master and query:
            for r in master.search(query, segment=segment, limit=limit):
                hits.append(
                    {
                        "symbol": r.symbol,
                        "name": r.name,
                        "exchange": r.exchange,
                        "segment": r.segment,
                        "instrument": r.instrument,
                        "lot_size": r.lot_size,
                        "tick_size": r.tick_size,
                        "freeze_qty": r.freeze_qty,
                        "expiry": r.expiry,
                        "isin": r.isin,
                    }
                )
        return _jsonable(
            {"instruments": hits, "datasets": datasets, "master_loaded": master is not None}
        )

    def list_strategies(self) -> dict[str, Any]:
        """Names of the strategies saved in the sandbox."""
        return {"strategies": sorted(p.stem for p in self.ws.strategies.glob("*.py"))}

    def write_strategy(self, name: str, code: str, overwrite: bool = True) -> dict[str, Any]:
        """Validate ``code`` (static guard + import + class check) and save it as ``name``.

        Only ``honba``, numpy, pandas and a few stdlib modules may be imported; file, network and
        introspection primitives are rejected. Nothing is written when validation fails.
        """
        path = strategy_path(self.ws.strategies, name)
        if path.exists() and not overwrite:
            raise FileExistsError(f"strategy {name!r} exists (pass overwrite=true)")
        class_name = check_strategy_source(code)
        cls = compile_strategy(code, str(path))
        tmp = path.with_suffix(".tmp")
        tmp.write_text(code)
        os.replace(tmp, path)
        declared = {
            k: {"default": p.default, "low": p.low, "high": p.high} for k, p in cls.params().items()
        }
        return _jsonable(
            {
                "name": name,
                "class": class_name,
                "path": str(path),
                "timeframe": getattr(cls, "timeframe", None),
                "params": declared,
            }
        )

    def run_backtest(
        self,
        strategy: str,
        symbols: Sequence[str],
        timeframe: str,
        start: str | None = None,
        end: str | None = None,
        params: Mapping[str, Any] | None = None,
        config: Mapping[str, Any] | None = None,
        adjust_corporate_actions: bool = False,
        engine: str | None = None,
    ) -> dict[str, Any]:
        """Run a saved strategy on stored candles; returns ``run_id`` and the summary.

        ``config`` accepts capital, fill, intrabar, allow_short, warmup_bars, liquidate_at_end,
        latency_ms, start, ``costs`` ("flat" | "india") and ``session`` (true = NSE hours).
        """
        cls = self._load_strategy(strategy)
        frames = self._candles(symbols, timeframe, start, end, adjust_corporate_actions)
        cfg = self._config(config, symbols)
        res = hb.backtest(cls, frames, cfg, params=dict(params or {}), engine=engine)
        run_id = self._run_id("bt")
        payload = {
            "run_id": run_id,
            "kind": "backtest",
            "strategy": strategy,
            "symbols": list(symbols),
            "timeframe": timeframe,
            "params": res.params,
            "summary": res.summary,
            "metrics": res.metrics,
            "trades": _records(res.trades),
        }
        self._runs[run_id] = payload
        self._save_report(run_id, payload)
        return _jsonable(
            {
                "run_id": run_id,
                "summary": res.summary,
                "total_trades": res.metrics.total_trades,
            }
        )

    def get_report(
        self, run_id: str, include_trades: bool = True, max_trades: int = 500
    ) -> dict[str, Any]:
        """Metrics, summary and trades (JSON) of a backtest or sweep run."""
        if not _RUN_ID.fullmatch(run_id):
            raise ValueError(f"invalid run_id {run_id!r}")
        payload = self._runs.get(run_id)
        if payload is None:
            file = self.ws.reports / f"{run_id}.json"
            if not file.is_file():
                raise KeyError(f"unknown run_id {run_id!r}")
            payload = json.loads(file.read_text())
        out = dict(payload)
        for key in ("trades", "rows"):
            if key in out:
                out[f"total_{key}"] = len(out[key])
                out[key] = out[key][:max_trades] if include_trades else []
        return _jsonable(out)

    def run_sweep(
        self,
        strategy: str,
        symbols: Sequence[str],
        timeframe: str,
        grid: Mapping[str, Sequence[Any]] | None = None,
        start: str | None = None,
        end: str | None = None,
        params: Mapping[str, Any] | None = None,
        config: Mapping[str, Any] | None = None,
        sort_by: str = "net_pnl",
        top: int = 20,
        adjust_corporate_actions: bool = False,
        engine: str | None = None,
    ) -> dict[str, Any]:
        """Grid-search a saved strategy's parameters; returns the best ``top`` rows."""
        cls = self._load_strategy(strategy)
        frames = self._candles(symbols, timeframe, start, end, adjust_corporate_actions)
        cfg = self._config(config, symbols)
        frame = hb.sweep(
            cls, frames, grid, cfg, params=dict(params or {}), sort_by=sort_by, engine=engine
        )
        run_id = self._run_id("sw")
        self._sweeps[run_id] = frame
        payload = {
            "run_id": run_id,
            "kind": "sweep",
            "strategy": strategy,
            "symbols": list(symbols),
            "timeframe": timeframe,
            "n_trials": frame.attrs["n_trials"],
            "n_skipped": frame.attrs["n_skipped"],
            "sort_by": sort_by,
            "rows": _records(frame),
        }
        self._runs[run_id] = payload
        self._save_report(run_id, payload)
        return _jsonable(
            {
                "run_id": run_id,
                "n_trials": payload["n_trials"],
                "n_skipped": payload["n_skipped"],
                "top": _records(frame, top),
            }
        )

    def overfit_audit(self, run_id: str) -> dict[str, Any]:
        """Overfitting audit (DSR / PBO) of a sweep run.

        Delegates to the registered backend (:func:`register_overfit_backend`), else to
        ``honba.research.overfit_audit`` / ``honba.overfit_audit`` when the SDK has one; until
        then it returns ``available: false`` with the trial count the audit will need.
        """
        if not _RUN_ID.fullmatch(run_id) or not run_id.startswith("sw-"):
            raise ValueError("overfit_audit needs the run_id of a run_sweep")
        frame = self._sweeps.get(run_id)
        if frame is None:
            report = self.get_report(run_id, include_trades=True, max_trades=10**9)
            frame = pd.DataFrame(report.get("rows", []))
            frame.attrs["n_trials"] = report.get("n_trials", len(frame))
        backend = _overfit_backend
        if backend is None:
            import honba.research as research

            backend = getattr(research, "overfit_audit", None) or getattr(hb, "overfit_audit", None)
        if backend is None:
            return {
                "run_id": run_id,
                "available": False,
                "n_trials": frame.attrs.get("n_trials"),
                "message": "no DSR / PBO backend is installed in this honba version",
            }
        return _jsonable({"run_id": run_id, "available": True, **dict(backend(frame))})

    @property
    def tool_functions(self) -> dict[str, Callable[..., dict[str, Any]]]:
        """Tool name -> callable, as registered with the MCP server."""
        return {
            name: getattr(self, name)
            for name in (
                "import_data",
                "list_instruments",
                "list_strategies",
                "write_strategy",
                "run_backtest",
                "get_report",
                "run_sweep",
                "overfit_audit",
            )
        }
