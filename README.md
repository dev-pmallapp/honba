# honba

Systemic market research platform for Indian securities (NSE/BSE), engineered on
**Nautilus Trader** with a **Jesse AI-inspired** quantitative research
philosophy. Components named from Japanese candlestick and market tradition.

[![License](https://img.shields.io/badge/license-LGPL--3.0-blue)](LICENSE)
[![Python](https://img.shields.io/badge/python-3.12+-blue)](https://python.org)

---

## What

honba is a desktop-first, dark-mode research workbench for Indian equities,
futures & options (F&O), commodities (MCX), and digital assets. It combines:

- **Nautilus Trader's** Rust-backed, event-driven simulation engine (tick-level
  fidelity, multi-venue, full option chain + Greeks support) as the execution
  and backtesting kernel.
- **Jesse AI's** progressive validation discipline — hypothesis → statistical
  screening → backtest → Monte Carlo → optimization → paper trade → live — as
  the research workflow.
- **East Asian naming** for every internal component: **Soba** (相場, market
  data hub), **Sakata** (酒田, strategy engine), **Kumo** (雲, risk layer),
  **Nagare** (流れ, streaming pipeline), and 16 others from Ichimoku, candlestick
  etymology, and Korean market terminology.

The platform targets **Indian retail and prosumer quants** who need a unified
instrument model spanning NSE cash, NSE/BSE F&O, and MCX commodities, with
fundamental data from Screener.in and sentiment from Moneycontrol feeding the
same backtesting engine that handles tick/bar market data.

## Why

Three gaps in Indian quantitative tooling that honba closes:

1. **No unified ISIN-aware instrument model** that spans equities, F&O, and
   commodities in a single backtesting loop. honba maps every NSE/BSE scrip,
   futures contract, and option strike into Nautilus Trader's 19-strong
   instrument taxonomy (`Equity`, `FuturesContract`, `OptionContract`, …).

2. **Fundamental data siloed from backtesting engines.** Screener.in P&L
   statements, Moneycontrol news sentiment, NSE delivery percentages — all
   arrive as `CustomData` events inside Nautilus, so a strategy can trade on
   "quarterly profit up >20%" with the same `on_bar()` handler it uses for
   price crosses.

3. **Bloated, animation-heavy dashboards** that punish long research sessions.
   honba uses HTMX + Tailwind (dark-mode primary) with TradingView Lightweight
   Charts. MPA routing — no SPA state bloat, no hydration waterfalls, no
   skeleton screens. Show old data while new loads; don't show spinners.

## Architecture (6 layers)

```
┌─ Shibui (渋い) ──── Frontend UI ───────────────────────────────────┐
│   HTMX + Tailwind dark-mode + Lightweight Charts + Alpine.js        │
│   MPA: /stock/TCS | /options/NIFTY | /backtest/{id} | /news        │
└─────────────────────────────────────────────────────────────────────┘
                               ▲ HTML fragments + JSON
┌─ (FastAPI) ──────── API & Server Layer ────────────────────────────┐
│   REST endpoints + WebSocket streams + Colibri LLM proxy            │
└─────────────────────────────────────────────────────────────────────┘
                               ▲ in-process
┌─ Sakata (酒田) ──── Research & Strategy Layer ──────────────────────┐
│   8-stage progressive validation chain:                             │
│   Hypothesis → Statistical Screen → Single Backtest → Portfolio     │
│   → Walk-Forward → Monte Carlo → Paper → Live                       │
│   Yosoku (予測): ML prediction (XGBoost, Colibri LLM sentiment)     │
│   Bunseki (分析): Factor analysis, performance metrics              │
└─────────────────────────────────────────────────────────────────────┘
                               ▲ Instrument / Bar / OrderEvent
┌─ Nautilus Trader ── Core Execution Engine ──────────────────────────┐
│   Rust kernel, event-driven, single-threaded (LMAX actor model)    │
│   Multi-venue: NSE + BSE + MCX simultaneously                      │
│   Full option chain + Greeks, CustomData Arrow bridge,              │
│   ParquetDataCatalog, 12 fill models, fixed-point Price/Quantity    │
└─────────────────────────────────────────────────────────────────────┘
                               ▲ clean bars & CustomData events
┌─ Renko (練行足) ── Data Normalization Layer ────────────────────────┐
│   Bhavcopy CSV → Bar, Option Chain JSON → QuoteTick + Greeks       │
│   Corporate action adjustment, deduplication, validation            │
└─────────────────────────────────────────────────────────────────────┘
                               ▲ raw HTML / CSV / JSON
┌─ Kage (陰) ──────── Data Ingestion Layer ───────────────────────────┐
│   Screener.in scraper (quarterly P&L, ratios, shareholding)         │
│   Moneycontrol scraper (news, corporate actions, sector map)        │
│   NSE Bhavcopy (daily), NSE Option Chain API (real-time),           │
│   NSE Delivery Data (daily), BSE Bhavcopy (daily)                   │
│   Nagare (流れ): real-time streaming pipeline (WebSocket/SSE)       │
└─────────────────────────────────────────────────────────────────────┘
```

## Research Philosophy (Jesse AI-inspired)

Research in honba is **gated**. Every stage costs more than the previous one,
so bad ideas die cheaply:

| Stage | What | Tool | Cost |
|---|---|---|---|
| 1. Hypothesis | Define entry/exit rules from fundamentals+price | `sakata hypothesize` | seconds |
| 2. Statistical Screen | Bootstrap significance test on the factor | `bunseki screen` | minutes |
| 3. Single-Stock Backtest | One stock, minimal config, quick pass | `sakata test` | seconds |
| 4. Portfolio Backtest | All qualifying stocks, with Indian costs | `sakata backtest` | minutes |
| 5. Walk-Forward | Rolling IS/OOS windows | `sakata optimize` | hours |
| 6. Monte Carlo | Trade shuffling + synthetic price paths | `sakata monte-carlo` | hours |
| 7. Paper Trading | Live data, simulated fills | `sakata paper` | weeks |
| 8. Live | Small allocation → scale up | `sakata live` | ongoing |

## Component Map

Every internal service, pipeline, and engine in honba bears a name from
Japanese, Chinese, or Korean trading tradition. No invented compounds.

| Name | 漢字/한글 | Meaning | Component |
|---|---|---|---|
| **Soba** | 相場 | the market | Market data hub — instruments, calendars, feeds |
| **Nagare** | 流れ | flow | Streaming pipeline — WebSocket, tick aggregation |
| **Dojima** | 堂島 | world's 1st futures exchange (1697) | Order execution & F&O subsystem |
| **Kaze** | 風 | wind | Real-time push — SSE, notifications |
| **Tsuchi** | 土 | earth | Persistent storage — PostgreSQL, Parquet |
| **Renko** | 練行足 | brick chart (noise filter) | Data cleaning — bhavcopy parsing, adjustment |
| **Bunseki** | 分析 | analysis | Analytics — factor computation, metrics |
| **Kehai** | 気配 | market hint / sign | Signal discovery — anomaly/pattern scanning |
| **Sakata** | 酒田 | Honma's hometown | Strategy engine — backtesting, optimization |
| **Tenkan** | 転換 | conversion (Ichimoku) | Signal triggers — signal-to-trade conversion |
| **Kijun** | 基準 | baseline (Ichimoku) | Benchmark — NIFTY TR, sector indices |
| **Chikou** | 遅行 | lagging (Ichimoku) | Validation — bias detection, confirmation |
| **Yosoku** | 予測 | prediction | ML — XGBoost, Colibri LLM, sentiment |
| **Kumo** | 雲 | cloud (Ichimoku) | Risk — exposure, VaR, circuit breakers |
| **Hikkake** | 引っ掛け | trap / false breakout | Anomaly detection — fake signals, data quality |
| **Kanshi** | 監視 | monitoring | System health — metrics, queue depth, alerts |
| **Ma** | 間 | negative space / pause | UI layout — spacing, panels, responsive |
| **Shibui** | 渋い | understated elegance | Design system — colors, typography, components |
| **Kage** | 陰/影 | shadow (wicks) | Web scrapers — Screener.in, NSE, Moneycontrol |
| **Chuei** | 추세 | trend | Regime detection — bull/bear/sideways state |

## Data Sources

| Source | What | Method | Frequency |
|---|---|---|---|
| **NSE Bhavcopy** | EOD OHLCV, all equities | CSV download | Daily (post-6PM IST) |
| **NSE Option Chain** | Strikes, OI, IV, LTP, Greeks | JSON API (auth cookie) | 60s during market hours |
| **NSE Delivery Data** | Delivery % per symbol | JSON API | Daily |
| **BSE Bhavcopy** | EOD OHLCV, scrip codes | ZIP download | Daily |
| **Screener.in** | Quarterly P&L, BS, CF, ratios, shareholding | HTML scrape | 12-hourly |
| **Moneycontrol** | News, corp actions, sector classification | HTML scrape | 15-30min (news), daily (actions) |
| **FII/DII Activity** | Daily net buy/sell | NSE CSV | Daily |

All market data stored as **Apache Parquet** via Nautilus's `ParquetDataCatalog`;
fundamental, news, and reference data stored in **PostgreSQL**. ISIN is the
universal cross-reference key.

## ML / AI Pipeline

honba ships with a pragmatic, laptop-friendly ML stack:

- **Yosoku** (予測): XGBoost/LightGBM for price direction and factor ranking.
  No GPU needed. Train on historical bars + fundamental features.
- **Colibri** (inference engine): local LLM via OpenaAI-compatible HTTP API
  on `localhost:8000`. Default model: **OLMoE 7B int8** (~7 GB download,
  3-4 tok/s CPU-only, runs on 8 GB RAM). Handles: news sentiment
  classification, earnings call summarization, Brio-mode closed-set scoring
  (market regime → probabilities with entropy).
- **FinGPT / FinBERT**: optional fine-tuning on Indian financial text for
  custom sentiment models.
- **Qlib (Microsoft)**: factor discovery and model zoo (48.7k stars, MIT) — can
  feed alpha factors into Sakata's strategy engine.

See `docs/research/` for the full survey: 30+ ML frameworks evaluated, with
Colibri integration guide, Jesse-vs-Nautilus unique feature catalogs, and
component naming rationale.

## Indian Market Specifics (built in, not bolted on)

- **NSE session model**: pre-open (9:00-9:15 IST), regular (9:15-3:30), block
  deal window (8:45-9:00), post-close (3:30-4:00), auction session, Muhurat
  trading.
- **SEBI-compliant transaction costs**: STT (0.1% delivery, 0.025% intraday,
  0.125% options sell-side), GST, stamp duty (state-variable), exchange fees,
  brokerage. Impact cost model from NSE published data.
- **Indian color convention**: green = up, red = down (opposite of US).
- **Holiday calendar**: ~15 annual holidays, Saturday/Sunday weekends,
  Muhurat Diwali session.
- **ISIN** (`IN` + 9-char NSIN + check digit) as universal instrument key
  mapping NSE symbol ↔ BSE scrip code ↔ futures/options contracts.
- **2024 SEBI weekly-expiry reform**: NSE retained Thursday as sole weekly
  expiry. BANKNIFTY weekly discontinued. Monthly expiry only for all other
  indices.

## Quick Links

| Document | Content |
|---|---|
| `docs/architecture.md` | Full 6-layer architecture, tech stack, asset prioritization |
| `docs/nautilus-mapping.md` | Indian securities → Nautilus Instrument models (Python examples) |
| `docs/market-structure.md` | NSE/BSE sessions, F&O specs, 2024 SEBI reforms, identifiers |
| `docs/data-sources.md` | Screener.in, Moneycontrol, NSE, BSE data reference |
| `docs/ingestion-pipeline.md` | Micro-engine design, normalization, Parquet catalog |
| `docs/frontend.md` | MPA/HTMX architecture, three-panel layout, charting strategy |
| `docs/design-system.md` | Shibui dark-mode palette, typography, component specs |
| `docs/backtesting.md` | 8-stage progressive validation pipeline with Nautilus integration |
| `docs/schemas.md` | CustomData, PostgreSQL, Parquet schema reference |
| `docs/roadmap.md` | 8-phase, 24-week implementation plan |
| `docs/research/component-naming.md` | Full naming schema — all 20 components with kanji/hangul |
| `docs/research/unique-nautilus.md` | 18 features found ONLY in Nautilus Trader |
| `docs/research/unique-jesse.md` | 17 features found ONLY in Jesse AI |
| `docs/research/colibri-integration.md` | Local LLM inference integration guide |
| `docs/research/ml-frameworks-survey.md` | 30+ trading ML frameworks evaluated |

---

**Status**: Architecture & research phase complete. Implementation begins at
Phase 0 (project scaffolding). See `docs/roadmap.md` for the full build plan.