# Architecture Overview — IndisNaut Market Researcher

## 1. Project Vision & Purpose

**IndisNaut Market Researcher** is a systemic, quantitative research platform purpose-built for
**Indian securities markets** (NSE/BSE). It fuses two lineages: the disciplined, backtest-first
research philosophy popularized by **Jesse AI** (hypothesize → backtest → validate → paper-trade →
live) and the institutional-grade, event-driven engineering rigor of **Nautilus Trader**, which
supplies the core simulation and execution kernel.

The platform's mission is to close the gap between raw Indian market data — bhavcopies, option
chains, corporate filings, sentiment feeds — and disciplined, statistically defensible trading
research. It targets:

- **Equities** (NSE/BSE cash segment)
- **Futures & Options (F&O)** — index and stock derivatives (NIFTY, BANKNIFTY, single-stock F&O)
- **Commodities** (MCX)
- **Crypto/Digital Assets** (lowest priority, included for architectural completeness only)

IndisNaut solves three recurring problems in the Indian retail/prosumer quant space: (1) the
absence of a unified, ISIN-aware instrument model spanning cash and derivatives; (2) the lack of
tooling that blends fundamental/alternative data (Screener.in, Moneycontrol) with tick/bar-level
backtesting; and (3) the prevalence of bloated, animation-heavy SPA dashboards that are poorly
suited to dense, long-session research work.

## 2. High-Level Architecture Diagram (Layered View)

```
┌──────────────────────────────────────────────────────────────────┐
│ 6. Frontend UI Layer                                              │
│    HTMX + Tailwind (dark-mode) + Lightweight Charts + Alpine.js   │
│    MPA routing: Watchlist | Chart | Fundamentals | Backtest Report│
└───────────────────────────▲────────────────────────────────────┘
                             │ HTML fragments / JSON (partial swaps)
┌───────────────────────────┴────────────────────────────────────┐
│ 5. API & Server Layer                                             │
│    FastAPI — REST endpoints + WebSocket streams (live bars,       │
│    order book, backtest progress)                                 │
└───────────────────────────▲────────────────────────────────────┘
                             │ in-process calls / message bus
┌───────────────────────────┴────────────────────────────────────┐
│ 4. Strategy & Research Layer                                      │
│    Jesse-inspired progressive validation chain:                   │
│    Idea → Unit Backtest → Walk-Forward → Monte Carlo →             │
│    Paper Trading → Live (gated promotion)                         │
└───────────────────────────▲────────────────────────────────────┘
                             │ Instrument / Bar / Data / OrderEvent
┌───────────────────────────┴────────────────────────────────────┐
│ 3. Nautilus Trader Core Engine                                    │
│    Event-driven kernel, multi-venue simulation, portfolio &       │
│    risk engine, execution/backtest clock (IST-aware sessions)     │
└───────────────────────────▲────────────────────────────────────┘
                             │ normalized Instrument/Bar/Tick objects
┌───────────────────────────┴────────────────────────────────────┐
│ 2. Data Normalization & Storage Layer                              │
│    Parquet data catalog (OHLCV, ticks, option chains) +            │
│    Relational DB (PostgreSQL: metadata, corp actions, users,       │
│    backtest run history)                                          │
└───────────────────────────▲────────────────────────────────────┘
                             │ raw scraped/downloaded payloads
┌───────────────────────────┴────────────────────────────────────┐
│ 1. Data Ingestion Layer                                           │
│    Scrapers/clients: Screener.in (fundamentals), Moneycontrol      │
│    (news/sentiment/corp actions), NSE/BSE bhavcopy + option chain  │
│    downloaders, rate-limited & resilient with retry/backoff        │
└──────────────────────────────────────────────────────────────────┘
```

Data flows bottom-up (ingestion → normalization → simulation → strategy signals → API → UI), while
user interactions (chart pans, screener queries, backtest launches) flow top-down as HTTP/WS
requests that are handled synchronously or streamed back as partial HTML/JSON.

## 3. Core Architectural Constraints

- **Nautilus Trader is the non-negotiable core engine.** All market data, instruments, and
  execution flow through Nautilus's native `Instrument`, `Bar`, `QuoteTick`/`TradeTick`, and
  `OrderEvent` models — no parallel/competing execution engine is permitted.
- **NSE/BSE session model is first-class.** The engine's clock and venue configuration must honor
  IST (UTC+5:30) and the four standard sessions: **pre-open** (08:45–09:15), **regular**
  (09:15–15:30), **block deal window**, and **post-closing session** (15:40–16:00), plus special
  sessions (muhurat trading, F&O expiry-day timing).
- **Jesse AI-inspired research discipline is enforced architecturally**, not just culturally: a
  strategy cannot be promoted to paper/live trading without passing through the gated validation
  chain (backtest → walk-forward → Monte Carlo robustness → paper trade).
- **Alternative data is a first-class event type** — fundamental/news events (e.g., quarterly
  profit change, corporate action, sentiment shift) are timestamped and injected into the
  backtesting event stream alongside price data, not bolted on as a side-channel.

## 4. Asset Prioritization Matrix

| Priority | Asset Class | Segment | Rationale |
|---|---|---|---|
| **High** | Equities | NSE/BSE Cash | Core research use case; richest fundamental data coverage. |
| **High** | Derivatives (F&O) | Index & Stock Futures/Options | Primary alpha-generation surface for active strategies. |
| **Medium** | Commodities | MCX | Secondary market; lower initial data/venue investment. |
| **Low** | Crypto/Digital Assets | — | Deprioritized due to volatility, regulatory ambiguity in India, and weak fit with fundamental-data thesis. |

## 5. Key Design Decisions

- **Why Nautilus Trader:** Rust-core performance, native multi-venue/multi-asset instrument
  modeling, deterministic event-driven backtesting, and a mature execution/risk engine remove the
  need to build a simulation kernel from scratch.
- **Why MPA/HTMX over SPA:** Research sessions are long and chart/state-heavy; a hypermedia-driven
  MPA with server-rendered partials avoids client-state bloat, reduces JS bundle size/complexity,
  and keeps navigation between watchlists, charts, and reports fast and predictable — mirroring
  TradingView's density without SPA overhead.
- **Why Lightweight Charts:** It is purpose-built for high-frequency time-series rendering with a
  minimal footprint, integrates cleanly with server-pushed OHLCV/tick data over WebSocket, and
  avoids the bloat of general-purpose charting libraries.
- **Why a Parquet data catalog:** Columnar, compressed, schema-stable storage is ideal for large
  historical bar/tick datasets and integrates directly with Nautilus's native `ParquetDataCatalog`,
  enabling fast backtest data loading without a heavyweight database round-trip.
- **Why Screener.in + Moneycontrol + NSE/BSE as sources:** Screener.in offers structured,
  well-normalized fundamental statements and ratios; Moneycontrol supplies sentiment, sector
  classification, and corporate actions; NSE/BSE provide authoritative bhavcopy, delivery %, and
  option chain data — together covering price, fundamentals, and market-structure dimensions with
  no single point of failure.

## 6. Technology Stack Summary

| Layer | Technologies |
|---|---|
| Core Engine | Python 3.12+, `nautilus_trader` |
| Backend/API | FastAPI, `httpx` (async scraping/API calls), `BeautifulSoup4` (HTML parsing), `pandas`/`polars` (data wrangling) |
| Frontend | HTMX, Tailwind CSS (dark-mode first), TradingView Lightweight Charts, Alpine.js (or vanilla JS for micro-interactions) |
| Storage | Parquet (`ParquetDataCatalog` — bars/ticks/option chains), PostgreSQL (metadata, users, corp actions, run history) |
| DevOps | Docker/Docker Compose, GitHub Actions (CI: lint, test, backtest smoke checks) |

## 7. System Boundaries & Integration Points

**In-scope:**
- Ingestion, normalization, and storage of NSE/BSE price data, option chains, and Screener.in/Moneycontrol alternative data.
- Nautilus-based backtesting, walk-forward analysis, and Monte Carlo robustness testing.
- Paper-trading simulation loop with the same strategy code path as backtesting.
- Web UI for research, screening, charting, and backtest reporting.

**Out-of-scope (for this phase):**
- Live brokerage order routing/execution to real NSE/BSE accounts.
- Non-Indian exchanges/venues beyond MCX commodities and token crypto support.
- Mobile-native applications.

**External integration points:**
- **NSE India** — bhavcopy files, option chain JSON endpoints (rate-limited, session-cookie based).
- **BSE India** — bulk bhavcopy downloads.
- **Screener.in** — HTML-scraped fundamental statements and ratios.
- **Moneycontrol.com** — HTML-scraped news, sentiment, sector classification, corporate actions.

All external integrations are isolated behind adapter modules in the Data Ingestion Layer so that
upstream site/schema changes are contained and do not leak into the Nautilus core or strategy
layer.
