# Jesse: Architecture, AI Agent Integration, and Quant Workflow Analysis

## 1. Executive Summary

**Jesse** ([jesse.trade](https://jesse.trade)) is an open-source algorithmic trading framework designed primarily for cryptocurrency spot and futures markets. Written in Python, it gained popularity among quantitative and algorithmic traders due to its:
- Ergonomic, opinionated strategy syntax (inspired by modern web frameworks like Laravel).
- Fast, vectorized and event-driven backtesting engine with strict prevention of look-ahead bias.
- Built-in live and paper trading capabilities with native exchange driver interfaces.
- Self-hosted architecture ensuring intellectual property (IP) and exchange API key security.
- **Model Context Protocol (MCP) server integration**, enabling modern AI coding agents (Claude, Cursor, Antigravity) to autonomously write, backtest, debug, and optimize strategies.

---

## 2. Core Architecture of Jesse

```
+-----------------------------------------------------------------------+
|                              Jesse System                             |
+-----------------------------------------------------------------------+
|  +--------------------+   +-------------------+   +----------------+  |
|  | Web UI (Vue.js)    |   | CLI (Click/Rich)  |   | AI Agent (MCP) |  |
|  +---------+----------+   +---------+---------+   +--------+-------+  |
|            |                        |                      |          |
|            +-------------------+    |    +-----------------+          |
|                                |    |    |                            |
|                                v    v    v                            |
|                   +-------------------------------+                   |
|                   |       API / Core Router       |                   |
|                   +---------------+---------------+                   |
|                                   |                                   |
|       +---------------------------+---------------------------+       |
|       v                           v                           v       |
| +------------+             +--------------+            +------------+ |
| | Candle     |             | Strategy     |            | Backtester | |
| | Storage    |             | Lifecycle    |            | & Engine   | |
| | (Postgres/ |             | Execution    |            | (Position/ | |
| | SQLite)    |             |              |            | Order Sim) | |
| +------------+             +--------------+            +------------+ |
|       ^                           ^                           ^       |
|       |                           |                           |       |
|       +---------------------------+---------------------------+       |
|                                   |                                   |
|                   +---------------+---------------+                   |
|                   | Indicators (Numba/Cython)     |                   |
|                   | Exchange Drivers (CCXT/Custom)|                   |
|                   +-------------------------------+                   |
+-----------------------------------------------------------------------+
```

### 2.1 Strategy Lifecycle Model
Jesse structures strategy authoring using an object-oriented paradigm where strategies inherit from `jesse.strategies.Strategy`. Key lifecycle hooks include:
- `should_long()` -> `bool`: Evaluated on candle close (or tick) to trigger a long position entry.
- `should_short()` -> `bool`: Evaluated to trigger a short entry.
- `go_long()`: Defines entry order size, type (limit vs market), and initial stop-loss/take-profit brackets.
- `go_short()`: Defines short entry order parameters.
- `update_position()`: Called on position changes or new candle closes to manage trailing stops, dynamic scaling in/out, or profit harvesting.
- `on_open_position()`, `on_close_position()`, `on_stop_loss()`, `on_take_profit()`: Callback handlers for trade state tracking.

### 2.2 Candle & Tick Data Engine
- **Storage**: Candles (OHLCV) are stored at 1-minute granularity in PostgreSQL (or SQLite for lightweight local runs).
- **Timeframe Resampling**: 1-minute candles are dynamically aggregated into higher timeframes (`3m`, `5m`, `15m`, `1h`, `4h`, `1D`) without data duplication.
- **Look-Ahead Bias Elimination**: The engine strictly ensures that a strategy accessing `self.candles` at timestamp $T$ only sees completed candles up to $T - 1$, preventing temporal leakage.

---

## 3. The AI Agent Revolution: Jesse's MCP Architecture

One of the most consequential advancements in Jesse is its native **Model Context Protocol (MCP)** server.

### 3.1 What is MCP in Jesse?
MCP provides a standardized protocol for LLMs and AI agents (such as Antigravity, Claude Desktop, Cursor) to discover and invoke tools, query system state, and interact with the local environment safely.

### 3.2 Tools Exposed by Jesse's MCP Server
1. **`import_candles`**: Commands the local engine to pull historical market data for designated symbols and date ranges.
2. **`list_strategies` / `read_strategy`**: Enables the AI agent to inspect strategy codebase, parameter definitions, and indicator logic.
3. **`write_strategy` / `update_strategy`**: Allows the AI agent to generate or refactor strategy code directly into the user's workspace.
4. **`run_backtest`**: Triggers a backtest run on specified symbols, timeframes, and date intervals.
5. **`get_backtest_report`**: Returns detailed backtest metrics (Sharpe ratio, Calmar, max drawdown, win rate, expectancy, total trades, trade log with entry/exit timestamps and reasons).
6. **`optimize_strategy`**: Executes parameter search and returns top candidate parameter vectors.

---

## 4. Strengths of Jesse
1. **Developer Experience (DX)**: Extremely intuitive Python API. A trader can draft a clean strategy in fewer than 50 lines of code.
2. **Deterministic Backtesting**: Rigorous order simulation taking into account order execution queues, slippage, maker/taker exchange fees, and margin liquidation.
3. **Clean Web UI + CLI**: Full parity between CLI commands and Web dashboard.
4. **Agentic Readiness**: First-class MCP tool interfaces allow LLMs to run self-healing research loops.

---

## 5. Limitations of Jesse for Traditional & Indian Markets
- **Crypto-Only Focus (24/7 continuous)**: Lacks session mechanisms (09:15 - 15:30 IST), morning pre-open auctions, circuit breakers, and intraday MIS auto-square-off windows.
- **No Indian Tax / Regulatory Surcharge Model**: Missing STT, GST, Stamp Duty, SEBI turnover fees, and DP charges.
- **Python-Only Performance Bottlenecks**: Heavy cross-validation and multi-asset universe scans suffer severe slowdowns without a compiled core.
- **Prone to Overfitting**: Lacks institutional anti-overfitting metrics (CPCV, PBO, Deflated Sharpe Ratio).
