"""API layer — FastAPI server, real-time push, templates, monitoring.

Consolidates the former ``kaze``, ``shibui`` and ``kanshi`` packages:

    Kaze   (風)   real-time push — SSE streams, WebSocket fan-out,
                  notification dispatch
    Shibui (渋い) design system — Tailwind tokens, Jinja2 components,
                  HTMX partials, chart defaults
    Kanshi (監視) monitoring — health checks, queue depth, latency metrics

Scope warning
-------------
The custom HTMX dashboard is **deferred, not scheduled**. Nautilus ships
``create_tearsheet()`` (Plotly: equity curve, drawdown, monthly heatmap,
returns distribution) plus ~34 portfolio statistics, which covers the
backtest-results UI outright. What a custom UI would add is a *data
browser* — and that competes with Screener.in, Tijori, Sensibull and
TradingView, all free and better resourced.

Build this only after week 6, with evidence from actual research runs
about what is genuinely missing.

See ``docs/research/build-vs-extend.md`` §1d, §10.
"""
