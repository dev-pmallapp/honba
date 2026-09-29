"""Reports of a :class:`~honba.research.result.BacktestResult`: JSON, HTML tearsheet, benchmark.

- :func:`report_dict` / ``result.to_json()``: a JSON-friendly dict (schema ``honba.backtest/1``)
  with summary, metrics, equity + drawdown, monthly returns, trades, groups and logs; web2 and
  the MCP server can reuse it as is.
- :func:`tearsheet_html` / ``result.tearsheet(path)``: one self-contained HTML file with KPI
  tiles, equity (and a rebased benchmark), drawdown, a monthly-returns heatmap, metrics and
  trade tables. Charts use Plotly when installed (``pip install honba[report]``; the Plotly
  bundle is inlined, no CDN) and hand-rolled inline SVG otherwise (``charts="svg"``).
- :func:`benchmark_metrics`: alpha, beta, correlation, tracking error, information ratio and
  the benchmark's own return / drawdown over the overlapping sessions.
"""

from __future__ import annotations

import html
import json
import math
from collections.abc import Mapping
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import TYPE_CHECKING, Any

import numpy as np
import pandas as pd

from honba.strategy.types import IST

from .metrics import daily_returns, drawdown_series

if TYPE_CHECKING:
    from .result import BacktestResult

__all__ = [
    "SCHEMA",
    "benchmark_metrics",
    "monthly_returns",
    "report_dict",
    "tearsheet_html",
    "to_json",
    "write_tearsheet",
]

SCHEMA = "honba.backtest/1"
_IST_MS = 19_800_000
_MAX_SVG_POINTS = 1_200
_MAX_TRADE_ROWS = 500
_MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")


# -- numbers ---------------------------------------------------------------------------------


def _clean(value: Any) -> Any:
    """Make ``value`` JSON-serialisable (NaN / inf -> None, numpy -> python, time -> ISO)."""
    if value is None or isinstance(value, (bool, str)):
        return value
    if isinstance(value, (np.bool_,)):
        return bool(value)
    if isinstance(value, (int, np.integer)):
        return int(value)
    if isinstance(value, (float, np.floating)):
        f = float(value)
        return f if math.isfinite(f) else None
    if isinstance(value, pd.Timestamp):
        return None if pd.isna(value) else value.isoformat()
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, (timedelta, pd.Timedelta)):
        return value.total_seconds()
    if isinstance(value, Mapping):
        return {str(k): _clean(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set, np.ndarray)):
        return [_clean(v) for v in value]
    if value is pd.NaT:
        return None
    return str(value)


def _records(frame: pd.DataFrame) -> list[dict[str, Any]]:
    return [_clean(r) for r in frame.to_dict(orient="records")] if len(frame) else []


def monthly_returns(equity: pd.Series, capital: float) -> pd.DataFrame:
    """Monthly returns (fractions): rows are years, columns 1..12, plus ``year`` (compounded).

    Month ends use the last equity of the IST month; the first month is measured against
    ``capital``.
    """
    if equity.empty:
        return pd.DataFrame(columns=[*range(1, 13), "year"], dtype=float)
    local = pd.DatetimeIndex(equity.index).tz_convert(IST)
    frame = pd.DataFrame({"year": local.year, "month": local.month, "eq": equity.to_numpy()})
    month_end = frame.groupby(["year", "month"])["eq"].last()
    prev = month_end.shift(1)
    prev.iloc[0] = capital
    rets = month_end / prev - 1.0
    table = rets.unstack("month").reindex(columns=range(1, 13))
    table["year"] = (1.0 + rets).groupby(level="year").prod() - 1.0
    table.columns.name = None
    return table


def _benchmark_close(benchmark: Any) -> pd.Series:
    if isinstance(benchmark, pd.DataFrame):
        cols = {c.lower(): c for c in benchmark.columns}
        if "close" not in cols:
            raise ValueError("a benchmark DataFrame needs a 'close' column")
        series = benchmark[cols["close"]]
        for name in ("time", "timestamp", "datetime", "date"):
            if name in cols:
                series = series.set_axis(pd.DatetimeIndex(pd.to_datetime(benchmark[cols[name]])))
                break
    elif isinstance(benchmark, pd.Series):
        series = benchmark
    else:
        raise TypeError("benchmark must be a pandas Series of prices or a frame with 'close'")
    index = pd.DatetimeIndex(pd.to_datetime(series.index))
    index = index.tz_localize(IST) if index.tz is None else index.tz_convert(IST)
    return pd.Series(series.to_numpy(dtype=float), index=index).sort_index()


def _daily_close(series: pd.Series) -> pd.Series:
    day = pd.DatetimeIndex(series.index).tz_convert("UTC") + pd.Timedelta(milliseconds=_IST_MS)
    return series.groupby(day.normalize()).last()


def benchmark_metrics(
    result: BacktestResult, benchmark: Any, *, risk_free_return: float | None = None
) -> dict[str, float | int | None]:
    """Benchmark-relative metrics on the sessions both series cover.

    ``benchmark`` is a price (or total-return index) Series indexed by time (naive = IST) or a
    frame with ``close`` and a time column / index. Returns ``beta``, ``alpha`` (annualised
    Jensen alpha), ``correlation``, ``tracking_error`` (annualised), ``information_ratio``,
    ``benchmark_return`` / ``strategy_return`` (compounded over the overlap),
    ``excess_return``, ``benchmark_sharpe``, ``benchmark_max_drawdown``, ``up_capture``,
    ``down_capture`` and ``n_days``. Undefined values are ``None``.
    """
    days = result.config.trading_days_per_year
    rf = (result.config.risk_free_return if risk_free_return is None else risk_free_return) / days
    strat = daily_returns(result.equity, result.config.capital)
    bench = _daily_close(_benchmark_close(benchmark)).pct_change()
    joined = pd.concat({"s": strat, "b": bench}, axis=1, join="inner").dropna()
    out: dict[str, float | int | None] = dict.fromkeys(
        (
            "beta",
            "alpha",
            "correlation",
            "tracking_error",
            "information_ratio",
            "benchmark_return",
            "strategy_return",
            "excess_return",
            "benchmark_sharpe",
            "benchmark_max_drawdown",
            "up_capture",
            "down_capture",
        )
    )
    out["n_days"] = len(joined)
    if len(joined) < 2:
        return out
    s, b = joined["s"].to_numpy(), joined["b"].to_numpy()
    var_b = float(np.var(b, ddof=1))
    s_ret = float(np.prod(1 + s) - 1)
    b_ret = float(np.prod(1 + b) - 1)
    out.update(strategy_return=s_ret, benchmark_return=b_ret, excess_return=s_ret - b_ret)
    if var_b > 0:
        beta = float(np.cov(s, b, ddof=1)[0, 1]) / var_b
        out["beta"] = beta
        out["alpha"] = (float(np.mean(s - rf)) - beta * float(np.mean(b - rf))) * days
        sd_b = math.sqrt(var_b)
        out["benchmark_sharpe"] = float(np.mean(b - rf)) / sd_b * math.sqrt(days)
    if np.std(s) > 0 and var_b > 0:
        out["correlation"] = float(np.corrcoef(s, b)[0, 1])
    active = s - b
    te = float(np.std(active, ddof=1))
    if te > 0:
        out["tracking_error"] = te * math.sqrt(days)
        out["information_ratio"] = float(np.mean(active)) / te * math.sqrt(days)
    bench_eq = pd.Series(np.cumprod(1 + b))
    out["benchmark_max_drawdown"] = float(-drawdown_series(bench_eq, 1.0).min())
    up, down = b > 0, b < 0
    if up.any() and b[up].mean() != 0:
        out["up_capture"] = float(s[up].mean() / b[up].mean())
    if down.any() and b[down].mean() != 0:
        out["down_capture"] = float(s[down].mean() / b[down].mean())
    return {k: _clean(v) for k, v in out.items()}


# -- JSON ------------------------------------------------------------------------------------


def _result_extras(result: BacktestResult) -> dict[str, Any]:
    extras: dict[str, Any] = {}
    groups = getattr(result, "groups", None)
    if isinstance(groups, pd.DataFrame) and len(groups):
        extras["groups"] = _records(groups.reset_index())
    return extras


def report_dict(
    result: BacktestResult,
    *,
    benchmark: Any = None,
    include_fills: bool = False,
) -> dict[str, Any]:
    """JSON-friendly report (schema :data:`SCHEMA`).

    Keys: ``schema``, ``strategy``, ``engine``, ``params``, ``config``, ``period``,
    ``summary``, ``metrics``, ``equity`` (``time``, ``time_ms``, ``equity``, ``drawdown``),
    ``monthly_returns`` (``{year: {month: r, "year": r}}``), ``trades``, ``logs`` and, when
    available, ``groups`` / ``benchmark`` / ``fills``. NaN / inf become ``null``, times ISO
    8601 (IST), durations seconds.
    """
    eq = result.equity_curve
    cfg = result.config
    summary = dict(result.summary)
    summary.pop("costs", None)
    monthly = monthly_returns(result.equity, cfg.capital)
    equity_rows = [
        {
            "time": t.isoformat(),
            "time_ms": int(t.value // 1_000_000),
            "equity": _clean(row.equity),
            "drawdown": _clean(row.drawdown),
        }
        for t, row in eq.iterrows()
    ]
    out: dict[str, Any] = {
        "schema": SCHEMA,
        "strategy": result.strategy,
        "engine": result.engine,
        "params": _clean(result.params),
        "config": _clean(
            {
                "capital": cfg.capital,
                "costs": cfg.costs.model,
                "fill": cfg.fill,
                "allow_short": cfg.allow_short,
                "trading_days_per_year": cfg.trading_days_per_year,
                "risk_free_return": cfg.risk_free_return,
                "session": cfg.session is not None,
            }
        ),
        "period": {
            "start": equity_rows[0]["time"] if equity_rows else None,
            "end": equity_rows[-1]["time"] if equity_rows else None,
            "bars": len(equity_rows),
        },
        "summary": _clean(summary),
        "costs": _clean(result.report.summary.as_dict()["costs"]),
        "metrics": _clean(result.metrics.as_dict()),
        "equity": equity_rows,
        "monthly_returns": {
            str(year): {("year" if k == "year" else str(k)): _clean(v) for k, v in row.items()}
            for year, row in monthly.iterrows()
        },
        "trades": _records(result.trades),
        "logs": [
            {
                "time": pd.Timestamp(t, unit="ms", tz="UTC").tz_convert(IST).isoformat(),
                "time_ms": t,
                "message": m,
            }
            for t, m in result.logs
        ],
    }
    out.update(_result_extras(result))
    if benchmark is not None:
        out["benchmark"] = benchmark_metrics(result, benchmark)
    if include_fills:
        out["fills"] = _records(result.fills)
    return out


def to_json(
    result: BacktestResult,
    path: str | Path | None = None,
    *,
    benchmark: Any = None,
    include_fills: bool = False,
    indent: int | None = None,
) -> str:
    """:func:`report_dict` as a JSON string, also written to ``path`` when given."""
    text = json.dumps(
        report_dict(result, benchmark=benchmark, include_fills=include_fills),
        indent=indent,
        allow_nan=False,
    )
    if path is not None:
        Path(path).write_text(text, encoding="utf-8")
    return text


# -- HTML ------------------------------------------------------------------------------------

_CSS = """
:root {
  color-scheme: light;
  --page: #f9f9f7; --surface: #fcfcfb; --ink: #0b0b0b; --ink-2: #52514e; --muted: #898781;
  --grid: #e1e0d9; --axis: #c3c2b7; --border: rgba(11,11,11,0.10);
  --series-1: #2a78d6; --series-2: #eb6834; --pos: #2a78d6; --neg: #e34948; --mid: #f0efec;
  --good: #006300; --bad: #d03b3b;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
    --page: #0d0d0d; --surface: #1a1a19; --ink: #ffffff; --ink-2: #c3c2b7; --muted: #898781;
    --grid: #2c2c2a; --axis: #383835; --border: rgba(255,255,255,0.10);
    --series-1: #3987e5; --series-2: #d95926; --pos: #3987e5; --neg: #e66767; --mid: #383835;
    --good: #0ca30c; --bad: #e66767;
  }
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --page: #0d0d0d; --surface: #1a1a19; --ink: #ffffff; --ink-2: #c3c2b7; --muted: #898781;
  --grid: #2c2c2a; --axis: #383835; --border: rgba(255,255,255,0.10);
  --series-1: #3987e5; --series-2: #d95926; --pos: #3987e5; --neg: #e66767; --mid: #383835;
  --good: #0ca30c; --bad: #e66767;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--page); color: var(--ink);
  font: 14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 1080px; margin: 0 auto; padding: 24px 16px 48px; }
h1 { font-size: 22px; margin: 0 0 4px; }
h2 { font-size: 15px; margin: 0 0 12px; }
.sub { color: var(--ink-2); margin: 0 0 20px; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px;
  padding: 16px; margin: 0 0 16px; }
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px; margin: 0 0 16px; }
.tile { background: var(--surface); border: 1px solid var(--border); border-radius: 10px;
  padding: 12px 14px; }
.tile .k { color: var(--ink-2); font-size: 12px; }
.tile .v { font-size: 22px; font-weight: 600; margin-top: 2px; }
.scroll { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; font-variant-numeric: tabular-nums; }
th, td { padding: 5px 8px; text-align: right; white-space: nowrap;
  border-bottom: 1px solid var(--grid); }
th { color: var(--ink-2); font-weight: 600; font-size: 12px; }
th:first-child, td:first-child { text-align: left; }
td.l { text-align: left; }
.cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; }
.heat td { text-align: center; min-width: 52px; border: 2px solid var(--surface); }
.note { color: var(--muted); font-size: 12px; margin: 8px 0 0; }
.chart { position: relative; }
.chart svg { display: block; width: 100%; height: auto; }
.chart .tip { position: absolute; pointer-events: none; background: var(--surface);
  border: 1px solid var(--border); border-radius: 6px; padding: 6px 8px; font-size: 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12); display: none; white-space: nowrap; }
.legend { display: flex; gap: 16px; color: var(--ink-2); font-size: 12px; margin: 0 0 6px; }
.legend i { display: inline-block; width: 14px; height: 2px; vertical-align: middle;
  margin-right: 6px; }
"""

_JS = """
document.querySelectorAll('.chart[data-series]').forEach(function (box) {
  var data = JSON.parse(box.getAttribute('data-series'));
  var svg = box.querySelector('svg'), tip = box.querySelector('.tip');
  var cross = svg.querySelector('.cross'), dots = svg.querySelectorAll('.dot');
  var vb = svg.viewBox.baseVal;
  function fmt(v) { return data.pct ? (v * 100).toFixed(2) + '%' :
    v.toLocaleString(undefined, {maximumFractionDigits: 2}); }
  svg.addEventListener('mousemove', function (e) {
    var r = svg.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * vb.width;
    var best = 0, bd = Infinity;
    for (var i = 0; i < data.x.length; i++) {
      var d = Math.abs(data.x[i] - x); if (d < bd) { bd = d; best = i; }
    }
    cross.setAttribute('x1', data.x[best]); cross.setAttribute('x2', data.x[best]);
    cross.style.display = '';
    var html = '<b>' + data.t[best] + '</b>';
    data.s.forEach(function (s, k) {
      dots[k].setAttribute('cx', data.x[best]); dots[k].setAttribute('cy', s.y[best]);
      dots[k].style.display = '';
      html += '<br>' + s.name + ': ' + fmt(s.v[best]);
    });
    tip.innerHTML = html; tip.style.display = 'block';
    var px = data.x[best] / vb.width * r.width;
    tip.style.left = Math.min(px + 12, r.width - tip.offsetWidth) + 'px';
    tip.style.top = '8px';
  });
  svg.addEventListener('mouseleave', function () {
    tip.style.display = 'none'; cross.style.display = 'none';
    dots.forEach(function (d) { d.style.display = 'none'; });
  });
});
"""


def _esc(value: Any) -> str:
    return html.escape("" if value is None else str(value))


def _fmt(value: Any, kind: str = "num") -> str:
    if value is None or (isinstance(value, float) and not math.isfinite(value)):
        return "-"
    if isinstance(value, (timedelta, pd.Timedelta)):
        days = value.total_seconds() / 86_400
        return f"{days:.1f} d" if days >= 1 else f"{value.total_seconds() / 3600:.1f} h"
    if isinstance(value, (pd.Timestamp, datetime)):
        return value.strftime("%Y-%m-%d %H:%M")
    if isinstance(value, bool) or not isinstance(value, (int, float, np.integer, np.floating)):
        return _esc(value)
    if kind == "pct":
        return f"{float(value) * 100:.2f}%"
    if kind == "int":
        return f"{int(value):,}"
    return f"{float(value):,.2f}"


def _nice_ticks(lo: float, hi: float, n: int = 5) -> list[float]:
    if not math.isfinite(lo) or not math.isfinite(hi):
        return []
    if hi == lo:
        return [lo]
    raw = (hi - lo) / max(n - 1, 1)
    mag = 10 ** math.floor(math.log10(raw))
    step = next(m * mag for m in (1, 2, 2.5, 5, 10) if m * mag >= raw)
    start = math.ceil(lo / step) * step
    ticks = []
    v = start
    while v <= hi + step * 1e-9:
        ticks.append(round(v, 12))
        v += step
    return ticks


def _downsample(series: pd.Series, limit: int = _MAX_SVG_POINTS) -> pd.Series:
    if len(series) <= limit:
        return series
    idx = np.unique(np.linspace(0, len(series) - 1, limit).round().astype(int))
    return series.iloc[idx]


def _svg_chart(
    series: list[tuple[str, pd.Series, str]],
    *,
    pct: bool = False,
    area: bool = False,
    height: int = 260,
    label: str = "",
) -> str:
    """Inline SVG line / area chart with a crosshair tooltip (one shared time axis)."""
    width, left, right, top, bottom = 960, 64, 16, 12, 28
    base = _downsample(series[0][1])
    if base.empty:
        return '<p class="note">No data.</p>'
    idx = base.index
    aligned = [(name, s.reindex(idx, method="ffill"), color) for name, s, color in series]
    values = np.concatenate([s.to_numpy(dtype=float) for _, s, _ in aligned])
    values = values[np.isfinite(values)]
    lo, hi = float(values.min()), float(values.max())
    if area:
        hi = max(hi, 0.0)
    pad = (hi - lo) * 0.05 or abs(hi) * 0.05 or 1.0
    lo, hi = lo - (0 if area else pad), hi + (0 if area else pad)
    plot_w, plot_h = width - left - right, height - top - bottom
    n = len(idx)
    xs = [left + (plot_w * i / (n - 1) if n > 1 else plot_w / 2) for i in range(n)]

    def y_of(v: float) -> float:
        return top + plot_h * (1 - (v - lo) / (hi - lo)) if hi > lo else top + plot_h / 2

    parts = [
        f'<svg viewBox="0 0 {width} {height}" role="img" aria-label="{_esc(label)}">',
    ]
    for tick in _nice_ticks(lo, hi):
        y = y_of(tick)
        text = f"{tick * 100:.0f}%" if pct else f"{tick:,.0f}"
        parts.append(
            f'<line x1="{left}" x2="{width - right}" y1="{y:.1f}" y2="{y:.1f}" '
            f'stroke="var(--grid)" stroke-width="1"/>'
            f'<text x="{left - 8}" y="{y + 4:.1f}" text-anchor="end" font-size="11" '
            f'fill="var(--muted)">{text}</text>'
        )
    local = pd.DatetimeIndex(idx).tz_convert(IST)
    for i in np.unique(np.linspace(0, n - 1, min(6, n)).round().astype(int)):
        anchor = "start" if i == 0 else "end" if i == n - 1 else "middle"
        parts.append(
            f'<text x="{xs[i]:.1f}" y="{height - 8}" text-anchor="{anchor}" font-size="11" '
            f'fill="var(--muted)">{local[i]:%Y-%m-%d}</text>'
        )
    parts.append(
        f'<line x1="{left}" x2="{width - right}" y1="{top + plot_h}" y2="{top + plot_h}" '
        f'stroke="var(--axis)" stroke-width="1"/>'
    )
    tip_series = []
    for name, s, color in aligned:
        vals = s.to_numpy(dtype=float)
        ys = [y_of(v) if math.isfinite(v) else y_of(lo) for v in vals]
        pts = " ".join(f"{x:.1f},{y:.1f}" for x, y in zip(xs, ys, strict=True))
        if area:
            zero = y_of(0.0)
            parts.append(
                f'<polygon points="{xs[0]:.1f},{zero:.1f} {pts} {xs[-1]:.1f},{zero:.1f}" '
                f'fill="var({color})" fill-opacity="0.25" stroke="none"/>'
            )
        parts.append(
            f'<polyline points="{pts}" fill="none" stroke="var({color})" stroke-width="2" '
            f'stroke-linejoin="round" stroke-linecap="round"/>'
        )
        tip_series.append(
            {"name": name, "y": [round(y, 1) for y in ys], "v": [_clean(v) for v in vals]}
        )
    parts.append(
        f'<line class="cross" y1="{top}" y2="{top + plot_h}" stroke="var(--muted)" '
        f'stroke-width="1" style="display:none"/>'
    )
    for _, _, color in aligned:
        parts.append(
            f'<circle class="dot" r="4" fill="var({color})" stroke="var(--surface)" '
            f'stroke-width="2" style="display:none"/>'
        )
    parts.append("</svg>")
    payload = {
        "x": [round(x, 1) for x in xs],
        "t": [f"{t:%Y-%m-%d %H:%M}" for t in local],
        "s": tip_series,
        "pct": pct,
    }
    legend = ""
    if len(aligned) > 1:
        legend = (
            '<div class="legend">'
            + "".join(
                f'<span><i style="background:var({c})"></i>{_esc(nm)}</span>'
                for nm, _, c in aligned
            )
            + "</div>"
        )
    data_attr = html.escape(json.dumps(payload, allow_nan=False), quote=True)
    body = "".join(parts)
    return (
        f'{legend}<div class="chart" data-series="{data_attr}">{body}<div class="tip"></div></div>'
    )


def _plotly_chart(
    series: list[tuple[str, pd.Series, str]],
    *,
    pct: bool,
    area: bool,
    height: int,
    include_js: bool,
) -> str:
    import plotly.graph_objects as go

    colors = {"--series-1": "#2a78d6", "--series-2": "#eb6834"}
    fig = go.Figure()
    for name, s, color in series:
        local = pd.DatetimeIndex(s.index).tz_convert(IST).tz_localize(None)
        fig.add_trace(
            go.Scatter(
                x=local,
                y=s.to_numpy(dtype=float),
                name=name,
                mode="lines",
                line={"color": colors.get(color, "#2a78d6"), "width": 2},
                fill="tozeroy" if area else None,
            )
        )
    fig.update_layout(
        height=height,
        margin={"l": 56, "r": 16, "t": 8, "b": 32},
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        font={"color": "#898781", "family": "system-ui, sans-serif", "size": 11},
        hovermode="x unified",
        showlegend=len(series) > 1,
        legend={"orientation": "h", "y": 1.08, "x": 0},
    )
    grid = "rgba(137,135,129,0.25)"
    fig.update_xaxes(gridcolor=grid, zeroline=False)
    fig.update_yaxes(gridcolor=grid, zeroline=False, tickformat=".0%" if pct else ",.0f")
    return fig.to_html(
        full_html=False, include_plotlyjs=bool(include_js), config={"responsive": True}
    )


def _heatmap(table: pd.DataFrame) -> str:
    if table.empty:
        return '<p class="note">No data.</p>'
    months = table[list(range(1, 13))].to_numpy(dtype=float)
    finite = np.abs(months[np.isfinite(months)])
    scale = float(finite.max()) if finite.size and finite.max() > 0 else 1.0
    head = "".join(f"<th>{m}</th>" for m in _MONTHS) + "<th>Year</th>"
    rows = []
    for year, row in table.iterrows():
        cells = []
        for m in range(1, 13):
            v = row[m]
            if not np.isfinite(v):
                cells.append("<td></td>")
                continue
            share = min(abs(v) / scale, 1.0) * 85
            pole = "--pos" if v >= 0 else "--neg"
            cells.append(
                f'<td style="background:color-mix(in oklab, var({pole}) {share:.0f}%, '
                f'var(--mid))" title="{year}-{m:02d}: {v * 100:.2f}%">{v * 100:.1f}</td>'
            )
        y = row["year"]
        cells.append(f"<td><b>{_fmt(y, 'pct')}</b></td>")
        rows.append(f"<tr><td>{year}</td>{''.join(cells)}</tr>")
    return (
        f'<div class="scroll"><table class="heat"><thead><tr><th></th>{head}</tr></thead>'
        f"<tbody>{''.join(rows)}</tbody></table></div>"
        '<p class="note">Monthly returns in percent (blue up, red down; darker = larger).</p>'
    )


_PCT_KEYS = {
    "net_profit_pct",
    "win_rate",
    "long_win_rate",
    "short_win_rate",
    "expectancy_pct",
    "cagr",
    "annual_volatility",
    "max_drawdown",
    "best_day",
    "worst_day",
    "alpha",
    "tracking_error",
    "benchmark_return",
    "strategy_return",
    "excess_return",
    "benchmark_max_drawdown",
    "return_pct",
}
_INT_KEYS = {
    "total_trades",
    "winning_trades",
    "losing_trades",
    "max_win_streak",
    "max_loss_streak",
    "longs",
    "shorts",
    "n_days",
    "trades",
}


def _kv_table(items: Mapping[str, Any]) -> str:
    rows = "".join(
        f"<tr><td>{_esc(k.replace('_', ' '))}</td>"
        f"<td>{_fmt(v, 'pct' if k in _PCT_KEYS else 'int' if k in _INT_KEYS else 'num')}</td>"
        "</tr>"
        for k, v in items.items()
    )
    return f"<table><tbody>{rows}</tbody></table>"


def _frame_table(frame: pd.DataFrame, limit: int = _MAX_TRADE_ROWS) -> str:
    if frame.empty:
        return '<p class="note">None.</p>'
    shown = frame.head(limit)
    head = "".join(f"<th>{_esc(c)}</th>" for c in shown.columns)
    body = []
    for _, row in shown.iterrows():
        cells = []
        for col, v in row.items():
            kind = "pct" if col in _PCT_KEYS else "int" if col in _INT_KEYS else "num"
            cls = ' class="l"' if isinstance(v, str) or v is None else ""
            cells.append(f"<td{cls}>{_fmt(v, kind)}</td>")
        body.append(f"<tr>{''.join(cells)}</tr>")
    more = (
        f'<p class="note">Showing {limit} of {len(frame)} rows (full list in to_json()).</p>'
        if len(frame) > limit
        else ""
    )
    return (
        f'<div class="scroll"><table><thead><tr>{head}</tr></thead>'
        f"<tbody>{''.join(body)}</tbody></table></div>{more}"
    )


_RISK_KEYS = (
    "cagr", "annual_volatility", "max_drawdown", "longest_underwater_days", "ulcer_index",
    "sharpe", "sortino", "calmar", "omega", "serenity", "best_day", "worst_day",
)  # fmt: skip
_TRADE_KEYS = (
    "total_trades", "winning_trades", "losing_trades", "win_rate", "avg_win", "avg_loss",
    "ratio_avg_win_loss", "expectancy", "expectancy_pct", "profit_factor", "largest_win",
    "largest_loss", "max_win_streak", "max_loss_streak", "avg_holding", "longs", "shorts",
    "long_pnl", "short_pnl", "total_costs", "trades_per_day",
)  # fmt: skip
_TRADE_COLS = (
    "symbol", "side", "qty", "entry_time", "exit_time", "entry_price", "exit_price", "pnl",
    "return_pct", "costs", "exit_reason", "entry_tag", "group",
)  # fmt: skip


def _card(title: str, body: str) -> str:
    return f'<div class="card"><h2>{_esc(title)}</h2>{body}</div>'


def _tile(label: str, value: str) -> str:
    return f'<div class="tile"><div class="k">{_esc(label)}</div><div class="v">{value}</div></div>'


def tearsheet_html(
    result: BacktestResult,
    *,
    benchmark: Any = None,
    benchmark_name: str = "Benchmark",
    title: str | None = None,
    charts: str = "auto",
) -> str:
    """Self-contained HTML tearsheet (see the module docstring).

    ``charts`` is ``"auto"`` (Plotly when importable, else SVG), ``"plotly"`` or ``"svg"``.
    """
    if charts not in ("auto", "plotly", "svg"):
        raise ValueError("charts must be auto, plotly or svg")
    use_plotly = charts == "plotly"
    if charts == "auto":
        try:
            import plotly

            use_plotly = True
        except ImportError:
            use_plotly = False
    elif use_plotly:
        try:
            import plotly  # noqa: F401
        except ImportError as exc:
            raise ImportError("charts='plotly' needs plotly: pip install 'honba[report]'") from exc

    cfg = result.config
    m = result.metrics
    eq = result.equity
    dd = result.equity_curve["drawdown"] if len(eq) else eq
    name = title or f"{result.strategy or 'Strategy'} tearsheet"
    period = (
        f"{pd.Timestamp(eq.index[0]):%Y-%m-%d} to {pd.Timestamp(eq.index[-1]):%Y-%m-%d}"
        if len(eq)
        else "no bars"
    )
    params = ", ".join(f"{k}={v}" for k, v in result.params.items()) or "defaults"

    equity_series: list[tuple[str, pd.Series, str]] = [("Strategy", eq, "--series-1")]
    bench_stats: dict[str, Any] | None = None
    if benchmark is not None and len(eq):
        close = _benchmark_close(benchmark)
        aligned = close.reindex(close.index.union(eq.index)).ffill().reindex(eq.index).dropna()
        if len(aligned):
            rebased = aligned / float(aligned.iloc[0]) * cfg.capital
            equity_series.append((benchmark_name, rebased, "--series-2"))
        bench_stats = benchmark_metrics(result, benchmark)

    def chart(series: list[tuple[str, pd.Series, str]], *, pct: bool, area: bool, first: bool):
        if use_plotly:
            return _plotly_chart(series, pct=pct, area=area, height=280, include_js=first)
        return _svg_chart(series, pct=pct, area=area, label=series[0][0])

    tiles = "".join(
        [
            _tile("Net profit", _fmt(m.net_profit)),
            _tile("Return", _fmt(m.net_profit_pct, "pct")),
            _tile("CAGR", _fmt(m.cagr, "pct")),
            _tile("Sharpe", _fmt(m.sharpe)),
            _tile("Max drawdown", _fmt(m.max_drawdown, "pct")),
            _tile("Win rate", _fmt(m.win_rate, "pct")),
            _tile("Trades", _fmt(m.total_trades, "int")),
        ]
    )
    md = m.as_dict()
    drawdown = chart([("Drawdown", dd, "--series-1")], pct=True, area=True, first=False)
    sections = [
        _card("Equity", chart(equity_series, pct=False, area=False, first=True)),
        _card("Drawdown", drawdown),
        _card("Monthly returns", _heatmap(monthly_returns(eq, cfg.capital))),
        '<div class="cols">'
        + _card("Risk", _kv_table({k: md[k] for k in _RISK_KEYS}))
        + _card("Trades", _kv_table({k: md[k] for k in _TRADE_KEYS}))
        + "</div>",
    ]
    if bench_stats is not None:
        sections.append(_card(f"Versus {benchmark_name}", _kv_table(bench_stats)))
    groups = getattr(result, "groups", None)
    if isinstance(groups, pd.DataFrame) and len(groups):
        sections.append(_card("Groups", _frame_table(groups.reset_index())))
    trades = result.trades
    if len(trades):
        trades = trades[[c for c in _TRADE_COLS if c in trades.columns]]
    sections.append(_card("Trade list", _frame_table(trades)))
    if result.logs:
        logs = pd.DataFrame(
            {
                "time": [
                    pd.Timestamp(t, unit="ms", tz="UTC").tz_convert(IST) for t, _ in result.logs
                ],
                "message": [msg for _, msg in result.logs],
            }
        )
        sections.append(_card("Log", _frame_table(logs)))

    return (
        '<!doctype html><html lang="en"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width, initial-scale=1">'
        f"<title>{_esc(name)}</title><style>{_CSS}</style></head><body><main>"
        f"<h1>{_esc(name)}</h1>"
        f'<p class="sub">{_esc(period)} · engine {_esc(result.engine)} · capital '
        f"{_fmt(cfg.capital)} · params {_esc(params)}</p>"
        f'<div class="tiles">{tiles}</div>'
        + "".join(sections)
        + ("" if use_plotly else f"<script>{_JS}</script>")
        + "</main></body></html>"
    )


def write_tearsheet(
    result: BacktestResult,
    path: str | Path | None = None,
    *,
    benchmark: Any = None,
    benchmark_name: str = "Benchmark",
    title: str | None = None,
    charts: str = "auto",
) -> str:
    """:func:`tearsheet_html`, also written to ``path`` when given. Returns the HTML."""
    text = tearsheet_html(
        result, benchmark=benchmark, benchmark_name=benchmark_name, title=title, charts=charts
    )
    if path is not None:
        Path(path).write_text(text, encoding="utf-8")
    return text
