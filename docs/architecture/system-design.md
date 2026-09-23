# Master System Design & Subsystem Topology

## 1. System Topology Overview

**Honba** unites the high-throughput concurrency of **Rust** with the flexibility and rapid iteration speed of **Python**.

```
+-------------------------------------------------------------------------------------------------------------------+
|                                                 HONBA SYSTEM TOPOLOGY                                             |
+-------------------------------------------------------------------------------------------------------------------+
|                                                                                                                   |
|   +------------------------------------+  +------------------------------------+  +----------------------------+  |
|   |         TRADINGVIEW WEB UI         |  |         TAURI 2.0 DESKTOP          |  |        TERMINAL CLI        |  |
|   |  - React + Tailwind + Lightweight  |  |  - Native macOS/Linux/Win Bundle   |  |  - Rich ASCII Charts       |  |
|   |    Charts (v4.2/v5)                |  |  - Zero-Config SQLite              |  |  - Fast Headless Runs      |  |
|   |  - Strategy Tester & Overfit Dock  |  |  - OS Keyring Secret Storage       |  |  - Automated CI/CD Audits  |  |
|   +-----------------+------------------+  +-----------------+------------------+  +-------------+--------------+  |
|                     |                                       |                                   |                 |
|                     +---------------------------------------+-----------------------------------+                 |
|                                                             |                                                     |
|                                                             v                                                     |
|                               +---------------------------------------------------+                               |
|                               |     Application Gateway (Axum / Tokio / WS)       |                               |
|                               |  REST API | WebSockets | MCP JSON-RPC Server      |                               |
|                               +-------------------------+-------------------------+                               |
|                                                         |                                                         |
|                                                         v                                                         |
|                               +---------------------------------------------------+                               |
|                               |         Model Context Protocol (MCP) Server       |                               |
|                               |     - Exposed Tools for Claude / Antigravity      |                               |
|                               |     - Research, Backtest, Overfit Diagnostics     |                               |
|                               +-------------------------+-------------------------+                               |
|                                                         |                                                         |
|                                                         v                                                         |
|                               +---------------------------------------------------+                               |
|                               |          Python Strategy & Research Layer         |                               |
|                               |  - Jesse-Style Strategy DSL (should_long, go_long)|                               |
|                               |  - Smart Beta Engine (NIFTY Alpha 50, A30)        |                               |
|                               |  - Jupyter / Polars / Tearsheet Generator         |                               |
|                               +-------------------------+-------------------------+                               |
|                                                         | (PyO3 Zero-Copy FFI)                                    |
|                                                         v                                                         |
|   +-----------------------------------------------------------------------------------------------------------+   |
|   |                                     RUST HIGH-PERFORMANCE CORE                                            |   |
|   |                                                                                                           |   |
|   |   +------------------------------------+               +----------------------------------------------+   |   |
|   |   |      Barter Event Pipeline         |               |          TickGrinder Supervisor Node         |   |   |
|   |   | MarketEvent -> Signal -> RiskGuard |               |   - Master Portfolio Risk Controller         |   |   |
|   |   |      -> OrderEvent -> Execution    |               |   - Per-Symbol Tick Processor Workers        |   |   |
|   |   +-----------------+------------------+               +----------------------+-----------------------+   |   |
|   |                     |                                                         |                           |   |
|   |                     +----------------------------+----------------------------+                           |   |
|   |                                                  |                                                        |   |
|   |                                                  v                                                        |   |
|   |   +------------------------------------+  +------------------------------------+  +-------------------+   |   |
|   |   |   Automated Anti-Overfit Engine    |  |   Indian Market & Tax Engine       |  | Fixed Income &    |   |   |
|   |   | - CPCV (Purged & Embargoed)        |  | - STT, GST, Stamp Duty, Brokerage  |  | Options Analytics |   |   |
|   |   | - PBO, Deflated Sharpe Ratio (DSR) |  | - Pre-Open, 15:15 MIS Auto-Square  |  | - Black-Scholes   |   |   |
|   |   | - Walk-Forward Efficiency (WFE)    |  | - Dhan HQ WebSocket & REST Driver  |  | - Greeks & Payoff |   |   |
|   |   +------------------------------------+  +------------------------------------+  +-------------------+   |   |
|   +-----------------------------------------------------------------------------------------------------------+   |
+-------------------------------------------------------------------------------------------------------------------+
```

---

## 2. Cross-Cutting Design Principles

1. **Parity**: The same strategy runs unaltered across historical simulation and live trading.
2. **Speed & Scale**: Vectorized Parquet analytics and Rayon multi-threaded CPU parallelization.
3. **Safety**: Automatic Deflated Sharpe Ratio (DSR) and Probability of Backtest Overfitting (PBO) verification on every optimization run.
4. **Agentic Readiness**: Native Model Context Protocol (MCP) server allowing AI agents to formulate, test, and repair strategies.
