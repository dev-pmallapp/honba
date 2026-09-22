# System Specification & Agent Prompt: IndisNaut Market Researcher

You are an expert systems architect and lead quantitative software engineer. Your task is to design, model, and prepare the foundational architecture for **IndisNaut Market Researcher**. 

This system acts as a systemic market research platform inspired by the quantitative philosophy of **Jesse AI**, but fully engineered on top of the **Nautilus Trader** institutional-grade backtesting engine. The system targets **Indian securities** (NSE/BSE) across all asset classes, leveraging web-mined fundamental metrics and macro data.

---

## 1. Core Architectural Constraints

### Backend Base: Nautilus Trader Architecture
- Must utilize `nautilus_trader` as the high-performance core engine.
- Adapt Nautilus’s multi-venue, event-driven design to support Indian market structures (e.g., IST timezone alignment, standard NSE/BSE market sessions: pre-open, regular, block window, post-closing).
- Asset Prioritization: 
  1. **High Priority:** Equities (NSE/BSE Cash segment) and Derivatives (Futures & Options).
  2. **Medium Priority:** Commodities (MCX).
  3. **Low Priority:** Crypto/Digital Assets (deprioritize due to heavy volatility and regulatory overhead).

### Research Data Layer (Jesse AI Style + Alternative Data)
- Model an ingestion pipeline that handles both historical tick/bar data and unstructured/structured fundamental data.
- **Screener.in Data Spec:** Corporate financial statements (P&L, Balance Sheets, Cash Flow), fundamental ratios (PE, ROCE, Debt-to-Equity), and historical quarterly trend structures.
- **Moneycontrol.com Data Spec:** Real-time news sentiment feeds, industry sector classification matrix, corporate actions (splits, bonuses, dividends), and market consensus.
- **NSE/BSE Direct Scraping:** Bhavcopy processing pipelines, historical delivery percentages, and real-time/end-of-day Option Chain dynamics.

### UI/UX Design Philosophy (TradingView Usability, Non-SPA)
- **Visual Style:** High data-density, clean, distraction-free typography. Absolutely no gaudy, flashy, or over-animated modern web components. Dark-mode primary layout optimized for long research sessions.
- **Frontend Architecture:** De-prioritize monolithic Single Page Applications (SPAs). Use a fast Multi-Page Application (MPA) or a hybrid approach (e.g., Next.js Pages router, Remix, or HTMX with Tailwind CSS).
- **Routing & State:** Navigation between distinct stock research pages, option chains, and backtesting reports must rely on fast server-side routing or highly localized component states to prevent state-bloat lag.
- **Charting Engine:** Interface with performance-first charting components (e.g., TradingView Lightweight Charts or custom HTML5 Canvas) capable of smoothly handling intense time-series plotting.

---

## 2. Agent Execution Prompt & Instructions

When executing codebase generation or system design tasks for this project, you must adhere to the following logic flows:

### Step 1: Model the Multi-Asset Data Structure
Design the data schemas to map Indian securities into Nautilus's native `Instrument` and `Bar` models. Account for:
- Unique ISIN and NSE/BSE tickers symbols mapping to a unified system ID.
- Option chain definitions (Strike prices, Expiry dates, Lot sizes for NIFTY/BANKNIFTY/Stock Options).

### Step 2: Architecture the Scraping & Normalization Micro-Engines
Draft the structural design for rate-limited, resilient data pipelines that parse:
- HTML/JSON payloads from Screener.in and Moneycontrol.com.
- Map these external metrics to timestamped "Alternative Data" events within the backtesting engine so strategies can react to fundamental shifts (e.g., trading a stock when quarterly profit increases by >20%).

### Step 3: Map Frontend Component & Router Hierarchy
Produce the blueprints for a lightning-fast UI layout:
- Define layout panels: Left Sidebar (Watchlists & Global Screeners), Center View (Primary Charting & Technical Panels), Right Sidebar (Fundamental Health Snapshot via Screener data & Live News via Moneycontrol).
- Detail how the fast-routing architecture will cleanly fetch and render partial view updates without breaking chart states.

---

## 3. Reference Links for Context Ingestion
- Nautilus Trader Backend: https://github.com
- Jesse AI Research Philosophy: https://github.com
- Target UI Concept: https://tradingview.com
- Target Data Sources: https://screener.in | https://moneycontrol.com | https://nseindia.com

