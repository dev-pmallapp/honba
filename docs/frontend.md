# Frontend Architecture Blueprint

This document defines the frontend architecture for honba: routing model,
layout system, charting strategy, state management, and technology stack. It implements the
UI/UX constraints in the root spec — high data-density, dark-mode-first, zero gaudy animation,
and MPA-style routing that avoids SPA state bloat.

## 1. Architecture Decision: MPA/Hybrid Approach

**Why not a monolithic SPA:** A client-side router (React Router/SPA shell) forces the entire
application's chart instances, watchlist state, screener filters, and news feed into one
long-lived JS memory space. For a research platform with dozens of distinct chart-heavy pages,
this produces state bloat, memory leaks across long sessions, and a large initial bundle that
delays first paint on data-dense pages — directly against the "long research session" and
"distraction-free" requirements.

**Recommended approach:** **HTMX + Tailwind CSS + TradingView Lightweight Charts**, server-rendered
via FastAPI + Jinja2, with a thin (~5-10KB) vanilla JS layer for chart lifecycle and WebSocket
plumbing. Each page is a real server-rendered document; navigation is a real HTTP request (fast,
cacheable, no client router). HTMX handles partial updates (live quote ticks, watchlist row swaps,
option-chain refresh) without full-page reloads.

**Alternative:** If the team strongly prefers a React-based stack, **Next.js App Router with React
Server Components** is acceptable — RSC pages are server-rendered by default and only hydrate
islands of interactivity (charts, live tickers), preserving most of the same state-isolation
benefits. This is a valid fallback, not the primary recommendation.

**Comparison for this use case:**

| Criterion | HTMX + Jinja2 (recommended) | Next.js App Router | Remix |
|---|---|---|---|
| Initial bundle size | ~16KB HTMX + ~15KB Alpine (~35KB total) | ~90-120KB React runtime + RSC payload | ~40-70KB (no VDOM, but full React runtime) |
| Navigation model | Real HTTP GET, server-rendered HTML | Server components + selective client hydration | Nested loaders, server-rendered |
| State isolation between pages | Total — each page is a fresh document | Good — RSC re-fetches per navigation | Good — loader re-runs per route |
| Chart lifecycle control | Manual, explicit (`Map<string, IChartApi>`) | Manual inside `useEffect`, fights re-renders | Manual inside `useEffect`, fights re-renders |
| Team familiarity needed | HTML/CSS + light JS | React + Next conventions | React + Remix conventions | 
| Live data (SSE/WS) ergonomics | Native `hx-trigger="sse:..."` / `ws-connect` | Manual `EventSource`/`WebSocket` in client component | Manual `EventSource`/`WebSocket` in client component |
| Best fit for data-dense, chart-heavy MPA | **Yes** | Yes, with more hydration discipline | Workable, less proven for this pattern |

## 2. Page Structure & Routing Design

All routes are server-rendered HTML documents (real navigations, no client router):

| Route | Page | Purpose |
|---|---|---|
| `/` | Dashboard Home | Market overview, top movers, indices snapshot |
| `/stocks` | Stock Screener | Filterable grid of all NSE/BSE stocks |
| `/stock/{symbol}` | Stock Research Page | Deep-dive: chart + fundamentals + news |
| `/options` | Option Chain Explorer | Live option chains for NIFTY/BANKNIFTY/Stocks |
| `/options/{underlying}/{expiry}` | Single Option Chain | Detailed chain with Greeks |
| `/backtest` | Backtest Lab | Configure and launch backtests |
| `/backtest/{id}` | Backtest Report | Equity curve, metrics, trade log |
| `/screener` | Fundamental Screener | Jesse AI-style multi-factor screening |
| `/news` | News Feed | Aggregated Moneycontrol news |
| `/watchlist` | Watchlist Manager | User watchlists (if authenticated) |

**State via URL, not client memory:** Query parameters carry page state so any view is a shareable,
bookmarkable, reload-safe link — e.g. `/stock/RELIANCE?tf=1D&from=2024-01-01&indicators=rsi,macd`,
`/options/NIFTY/2025-01-30?strikes=atm5`, `/backtest/run-8842?tab=trades`. Server routes read these
params to render the correct initial state; HTMX-driven partial refreshes update the URL via
`hx-push-url="true"` so back/forward navigation stays consistent.

## 3. Layout Blueprint — Three-Panel System

```
+--------------------------------------------------+
| TOP BAR: Symbol Search | Timeframe | Theme Toggle |
+--------+----------------------------+------------+
|  LEFT  |        CENTER              |   RIGHT    |
| SIDEBAR|     PRIMARY CHART          |  SIDEBAR   |
|        |     (Lightweight Charts)   |            |
| Watch- |                            | Fundamen-  |
| lists  |     Technical Panels       | tal Snapshot|
| Global |     (Indicators, Volume,   | (Screener  |
| Screen-|      RSI, MACD, etc.)      |  data: PE, |
| ers    |                            |  ROCE,     |
|        |     Bottom: Multi-time-    |  D/E, etc.)|
|        |     frame mini charts      |            |
|        |                            | Live News  |
|        |                            | (Moneycon- |
|        |                            |  trol feed)|
+--------+----------------------------+------------+
| BOTTOM: Order Book / Market Depth / FII/DII Data |
+--------------------------------------------------+
```

**Left Sidebar** (`~260px`, fixed, dark surface `bg-neutral-950`, independently scrollable):
Watchlists grouped by sector/strategy (collapsible `<details>` groups, no JS framework required for
collapse), Global Screeners (Top Gainers, Top Losers, 52W High/Low) as HTMX-refreshed lists
(`hx-trigger="every 15s"`).

**Center View** (`flex-1`, dominant space, min-width guard to prevent chart squeeze): Primary
candlestick chart (Lightweight Charts) at the top, Volume histogram pane directly below sharing the
time axis, then a stacked indicator pane (RSI/MACD) using Lightweight Charts' multi-pane API. A
tabbed strip beneath switches between multi-timeframe mini-charts (1D/1W/1M snapshots) without
destroying the primary chart instance.

**Right Sidebar** (`~320px`, fixed): Top half is the **Fundamental Health Snapshot** — a card grid
of Screener.in-derived metrics (PE, ROCE, Debt-to-Equity, Sales Growth, Promoter Holding) rendered
from `partials/fundamental-metric-card.html`. Bottom half is the **Live News Feed** — Moneycontrol
headlines with relative timestamps, refreshed via `hx-trigger="every 30s"` against a
`/partials/news/{symbol}` endpoint.

**Bottom Bar** (full width, collapsible, `~180px` expanded): Market Depth / Order Book (5-level
bid-ask ladder) and FII/DII net activity ticker, both HTMX-polled.

Responsive behavior: below `1280px` viewport width, right sidebar collapses into an off-canvas
drawer toggled from the top bar (Alpine.js `x-data="{open:false}"`); left sidebar collapses to icon
rail only. Chart center view never shrinks below a usable minimum — sidebars yield first.

## 4. Charting Strategy

- **Primary library:** TradingView **Lightweight Charts** (Apache 2.0, ~35KB gzipped, Canvas 2D
  renderer, 60FPS on tens of thousands of bars).
- **Series types used:** `CandlestickSeries` (OHLC), `HistogramSeries` (volume, overlaid with
  reduced opacity), separate panes for oscillators (RSI, MACD) via the v5 multi-pane API.
- **Initial render:** Server renders the page with the first N bars embedded as a JSON blob in a
  `data-bars` attribute on the chart container (`<div id="chart-root" data-bars='[...]'>`) — no
  round-trip fetch needed for first paint. The thin JS layer parses this attribute on
  `DOMContentLoaded` and calls `chart.setData()`.
- **Live updates:** A WebSocket (or SSE fallback) connection streams tick/bar updates; the client
  layer calls `series.update(bar)` for O(1) incremental redraws — never `setData()` on tick, which
  would re-render the whole series.
- **Timeframe controls:** Buttons for `1m, 5m, 15m, 1H, 4H, 1D, 1W, 1M` are plain `hx-get` links
  targeting a hidden `#bar-data` swap zone that returns a `<script>` payload with the new JSON;
  the JS layer intercepts via an `htmx:afterSwap` listener and calls `chart.setData()` — the chart
  `<div>` itself is never touched by the HTMX swap (see §5).
- **Custom indicators/overlays:** Lightweight Charts v5 plugin/primitive system —
  `series.attachPrimitive(...)` for trend lines, support/resistance zones, and custom drawing tools,
  keeping these outside the core series data model.
- **Fallback library:** **uPlot** (~50KB, MIT) held in reserve if a future requirement (e.g., huge
  tick-level scatter plots, custom non-financial chart types) exceeds what Lightweight Charts'
  financial-chart-focused API comfortably expresses.

## 5. State Management Strategy

- **Server is the source of truth.** Filters, timeframe, date range, selected indicators all live
  in the URL query string, not in client-side JS state or a global store.
- **HTMX for partials:** `hx-get`/`hx-post` fetch fragments for watchlist rows, screener grid pages,
  option-chain tables, news items. `hx-trigger="every 5s"` (or SSE via `hx-ext="sse"`) drives
  low-frequency live regions (news, FII/DII ticker); high-frequency tick data (chart price stream)
  bypasses HTMX entirely and uses a raw WebSocket in the JS layer, since per-tick DOM swaps would be
  wasteful and janky.
- **Thin JS layer responsibilities (and only these):** chart instance create/destroy lifecycle,
  WebSocket connection management and reconnect/backoff, cross-chart crosshair sync (`subscribeCrosshairMove`
  broadcasting to sibling chart instances on the same page), reading the initial `data-bars` payload.
- **localStorage is used only for:** theme preference (`dark`/`light`), last-viewed symbol list
  (for quick-jump autocomplete), and manual watchlist ordering. It is explicitly **not** used for
  chart state, filters, or anything that should be shareable/bookmarkable via URL.
- **Chart survival across HTMX swaps:** The chart `<div>` is placed **outside** any element targeted
  by an `hx-swap`. Sibling controls (timeframe buttons, indicator toggles) live in their own HTMX
  swap zone and communicate with the chart via custom events (`chart:setData`, `chart:addIndicator`)
  rather than DOM replacement. Each chart instance is registered in a page-level
  `Map<string, IChartApi>` keyed by container id, so multi-chart layouts (e.g., multi-timeframe
  mini-charts) can be individually torn down (`chart.remove()`) on navigation without leaking
  Canvas contexts.

## 6. Component Tree / Template Hierarchy

```
templates/
├── base.html                      # <html>, <head>, theme bootstrap, <header>/<footer>
│   └── layout-three-panel.html    # extends base; left/center/right/bottom grid shell
│       ├── pages/dashboard.html
│       ├── pages/stocks.html
│       ├── pages/stock_research.html
│       ├── pages/options.html
│       ├── pages/option_chain.html
│       ├── pages/backtest_lab.html
│       ├── pages/backtest_report.html
│       ├── pages/screener.html
│       ├── pages/news.html
│       └── pages/watchlist.html
└── partials/                      # HTMX fragment targets, no <html>/<body> wrapper
    ├── watchlist-row.html
    ├── news-item.html
    ├── fundamental-metric-card.html
    ├── option-strike-row.html
    ├── screener-grid-row.html
    └── bar-data.json.jinja        # JSON fragment consumed by chart JS, not rendered as DOM
```

`base.html` owns the top bar (symbol search, timeframe, theme toggle) and global `<script>`/`<link>`
tags. `layout-three-panel.html` owns the left/center/right/bottom grid and is the only template
that instantiates the chart mount point; individual `pages/*.html` fill named `{% block %}` slots
within each panel.

## 7. Technology Stack

| Layer | Choice | Notes |
|---|---|---|
| Server | Python **FastAPI** + **Jinja2** | Matches backend stack in `01-architecture-overview.md`; Next.js is an acceptable alternative if React is mandated |
| Interactivity | **HTMX** (~16KB, zero deps) | HTML attributes drive AJAX/SSE/WS; no client router |
| Minimal reactivity | **Alpine.js** (~15KB) | Dropdowns, tabs, off-canvas drawers, theme toggle — nothing more |
| CSS | **Tailwind CSS v4**, `class`-based dark mode | Custom theme extension for dark-first palette, no default light theme served by mistake |
| Charts | **lightweight-charts** (npm) | See §4 |
| Fallback charts | **uPlot** | Held in reserve, not wired in by default |
| **Total JS budget** | **< 80KB** (HTMX + Alpine + thin custom layer, excluding chart library and chart data) | Enforced as a CI bundle-size check |

## 8. Progressive Enhancement

- **Core pages work without JavaScript.** Every route above returns fully server-rendered HTML with
  real data — stock research pages show the latest static OHLC table and fundamental cards even if
  JS is blocked.
- **JS enhances, never gates:** Canvas-based charting, HTMX live polling, and WebSocket tick
  streaming are additive layers on top of the static HTML baseline.
- **Graceful degradation:** If the chart JS or WebSocket connection fails to initialize, the chart
  mount point falls back to rendering the last-known static price table plus a visible
  "Live updates unavailable" banner, rather than a blank panel or console-only failure.
</content>
