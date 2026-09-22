# Project Roadmap — honba

This document is the actionable, phased implementation plan for **honba**.
It sequences the architecture described in `01-architecture-overview.md` through
`05-data-ingestion-pipeline.md` into a 24-week build plan, culminating in a usable MVP at Week 16
and advanced research capabilities by Week 24.

## 1. Project Phases Overview

### Phase 0: Foundation (Weeks 1-2)
- Project scaffolding: Python project structure, virtual env, dependency management (poetry or uv).
- Nautilus Trader installation and verification (build from source or pip, confirm `BacktestEngine`
  runs a trivial example end-to-end).
- Git repository setup, `.gitignore`, pre-commit hooks (ruff, formatting).
- Initial documentation review and refinement (this doc set).

### Phase 1: Core Data Models & Instrument Registry (Weeks 3-4)
- Implement NSE/BSE instrument definitions as Nautilus `Instrument` objects.
- Create the instrument master database (PostgreSQL schema + seed data).
- Build ISIN ↔ NSE symbol ↔ BSE code cross-reference table.
- Define and register all `CustomData` types (`ScreenerQuarterlyFundamentals`, `CorporateAction`,
  `DeliveryData`, etc.) per `02-nautilus-core-mapping.md`.
- Write unit tests for instrument creation and validation.

### Phase 2: Data Ingestion Pipelines (Weeks 5-8)
- **Week 5-6:** NSE Bhavcopy downloader + parser (daily CSV → `Bar`/`TradeTick` → Parquet).
- **Week 6-7:** Screener.in scraper (HTML parser → fundamental data → PostgreSQL + Parquet
  `CustomData`).
- **Week 7:** Moneycontrol news scraper (HTML parser → news items → PostgreSQL).
- **Week 8:** NSE Option Chain fetcher (JSON API → `QuoteTick` + `OptionGreeks` → Parquet).
- **Week 8:** NSE Delivery Data + FII/DII Activity fetchers.
- Pipeline orchestration: Airflow DAGs or cron + asyncio scheduler.
- Error handling, rate limiting, retry logic across all adapters.

### Phase 3: Nautilus Integration & Basic Backtesting (Weeks 9-10)
- Verify data loads correctly into Nautilus `BacktestEngine`.
- Implement a simple moving average crossover strategy as proof-of-concept.
- Run first backtest on NIFTY 50 stocks with Bhavcopy data.
- Implement transaction cost model for Indian markets (STT, GST, stamp duty, brokerage).
- Build basic backtest result formatter (JSON output → can feed to UI later).

### Phase 4: Backend API Server (Weeks 11-12)
- FastAPI application with routes:
  - `GET /api/stocks` — list all instruments
  - `GET /api/stocks/{symbol}` — stock detail with fundamentals
  - `GET /api/stocks/{symbol}/chart` — historical OHLCV bars (JSON)
  - `GET /api/options/{underlying}` — option chain
  - `GET /api/options/{underlying}/{expiry}` — specific expiry chain
  - `POST /api/backtest/run` — run a backtest
  - `GET /api/backtest/{id}` — get backtest results
  - `GET /api/news?symbol={symbol}` — news feed
  - `WebSocket /ws/stream?symbol={symbol}` — real-time tick stream (for future live data)
- Jinja2 template rendering for HTML pages (MPA approach).

### Phase 5: Frontend UI (Weeks 13-16)
- **Week 13:** Base layout (three-panel system), navigation, dark mode theme.
- **Week 13:** Stock Research Page — chart with Lightweight Charts, fundamental snapshot panel.
- **Week 14:** Stock Screener Page — filterable data table.
- **Week 14:** Option Chain Explorer — live option chain grid.
- **Week 15:** Backtest Lab — configuration form + results display.
- **Week 15:** Watchlist sidebar, news feed panel.
- **Week 16:** Polish, responsiveness, accessibility, performance optimization.

> **MVP checkpoint — end of Week 16.** See Section 3.

### Phase 6: Research & Strategy Framework (Weeks 17-18)
- Implement Jesse AI-inspired statistical screening (bootstrap significance test).
- Build the progressive validation pipeline (hypothesis → screen → backtest → Monte Carlo).
- Create research templates for common strategies:
  - ROCE + profit growth momentum
  - Low PE + high promoter holding value
  - Option selling (short strangle/straddle on NIFTY)
  - FII/DII flow following
- Performance analytics dashboard (Sharpe, Sortino, drawdown, rolling metrics).

### Phase 7: Advanced Features (Weeks 19-21)
- Walk-forward optimization engine.
- Monte Carlo simulator (trade shuffling + synthetic price paths).
- Multi-strategy portfolio backtesting.
- Sector rotation strategies.
- Option strategy backtesting (spreads, iron condors, butterflies).
- Factor-based model (Fama-French style for the Indian market).

### Phase 8: Production Hardening (Weeks 22-24)
- Docker containerization (app + PostgreSQL + Airflow).
- Docker Compose for local dev.
- CI/CD with GitHub Actions (lint, test, type-check).
- Production deployment guide (VPS, cloud, or on-prem).
- Security review: API auth, scraping rate limits, data storage compliance.
- Comprehensive test coverage.
- Performance benchmarking and profiling.

## 2. Technology Stack by Layer

| Layer | Technology | Version |
|---|---|---|
| Core Engine | `nautilus_trader` | latest stable |
| Web Framework | FastAPI | 0.115+ |
| Async HTTP | `httpx` | 0.28+ |
| HTML Parsing | BeautifulSoup4 + lxml | 4.12+ |
| Data Processing | pandas, polars | 2.x, 1.x |
| Data Validation | Pydantic | 2.x |
| ORM | SQLAlchemy 2.0 | 2.0+ |
| Database | PostgreSQL | 16+ |
| Task Queue | Celery + Redis | optional |
| Orchestration | Apache Airflow or Prefect | 2.x, 3.x |
| Frontend | HTMX, Tailwind CSS, Lightweight Charts, Alpine.js | latest |
| Testing | pytest, pytest-asyncio | 8.x |
| Linting | ruff | latest |
| Container | Docker, Docker Compose | latest |

## 3. MVP Feature Set (Phase 0-5 = 16 weeks)

What the MVP delivers:
- Historical daily charts for any NSE/BSE stock (candle + volume).
- Fundamental data panel (P&L, Balance Sheet, Ratios) from Screener.in.
- Live option chain viewer for NIFTY + 5 top stocks.
- Simple backtesting engine: select stock, timeframe, basic strategy, view results.
- Stock screener: filter by sector, market cap, PE, ROCE.
- Dark-mode, high-density UI with three-panel layout.
- No login/auth required (research tool, not trading platform).

## 4. Known Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| NSE API rate limiting/blocking | High | Respectful scraping, cookie rotation, fallback to Bhavcopy only. |
| Screener.in blocks scraping | Medium | Low frequency (12hr), use export button, alternative: Moneycontrol financials. |
| Nautilus Trader learning curve | Medium | Dedicate Week 1-2 to study; use official docs and examples. |
| Indian market data gaps (delisting, symbol changes) | Medium | ISIN-based master table, historical symbol mapping. |
| Option chain data volume (NIFTY has 100+ strikes x 4 expiries) | Low | Parquet compression, only store recent 2 expiries for live. |
| SEBI regulatory changes | Low | Monitor SEBI circulars; platform is research-only, not execution. |

## 5. Future Roadmap (Post-MVP, Q3-Q4 2026)

- Live market data integration (NSE/BSE WebSocket feeds).
- Machine learning strategy builder (feature engineering from fundamentals + price).
- Backtesting with tick-level data (not just daily bars).
- Multi-user support with authentication.
- Strategy marketplace / sharing.
- Mobile companion app (view-only).
- NSE/BSE/MCX auto-trading integration (through broker APIs like Zerodha Kite, Upstox).

## 6. Milestone Summary

| Week | Milestone |
|---|---|
| 2 | Dev environment ready; Nautilus verified locally. |
| 4 | Instrument registry + custom data types in place. |
| 8 | All four data ingestion pipelines operational. |
| 10 | First successful backtest on NIFTY 50 with cost model. |
| 12 | Backend API server feature-complete for MVP routes. |
| 16 | **MVP delivered** — full research UI, screener, options, backtest lab. |
| 18 | Progressive validation research framework live. |
| 21 | Walk-forward, Monte Carlo, and multi-strategy backtesting available. |
| 24 | Dockerized, CI/CD-gated, production-hardened release. |
