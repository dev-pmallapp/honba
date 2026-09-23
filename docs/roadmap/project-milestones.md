# Project Roadmap & Implementation Milestones

## Phase 1: Rust Core Engine & Dhan HQ Foundation
- [x] Comprehensive research and comparative synthesis across Jesse, Barter-rs, OpenAlgo, and TickGrinder.
- [x] Complete hierarchical architectural specifications.
- [ ] Implement Rust data primitives: `Candle`, `Tick`, `OrderBook`, `Position`, `Order`, `Trade`.
- [ ] Implement exact Indian regulatory tax engine (STT, GST, Stamp Duty, Brokerage, SEBI fee).
- [ ] Implement Barter-style event-driven pipeline and order matching simulator in Rust.
- [ ] Implement Dhan HQ REST & WebSocket binary client in Rust.
- [ ] Integrate OS Keyring security (`keyring-rs`) for token encryption.

---

## Phase 2: Python Strategy DSL & Terminal CLI
- [ ] Implement Jesse-style Python `Strategy` base class (`should_long`, `go_long`, `update_position`).
- [ ] Build PyO3 native bindings (`maturin`) bridging Rust core and Python strategies.
- [ ] Implement Indian session scheduling (09:15 - 15:30 IST, intraday square-off at 15:15).
- [ ] Build interactive Terminal CLI (`honba backtest`, `honba audit`) with Rich tables.
- [ ] Implement sample strategies (NIFTY Alpha 50 momentum, BankNIFTY mean-reversion).

---

## Phase 3: Automated Anti-Overfitting Suite
- [ ] Combinatorial Purged Cross-Validation (CPCV) with purging and embargoing in Rust.
- [ ] Probability of Backtest Overfitting (PBO) computation engine.
- [ ] Deflated Sharpe Ratio (DSR) and Probabilistic Sharpe Ratio (PSR) calculations.
- [ ] Walk-Forward Optimization (WFO) runner.
- [ ] Monte Carlo execution stress-testing (slippage perturbation, latency injection).

---

## Phase 4: TradingView Web UI & MCP AI Agent
- [ ] Implement TradingView Lightweight Charts canvas UI with custom overlays.
- [ ] Build bottom dock: Strategy Tester, Anti-Overfitting Matrix, and Trade Ledger.
- [ ] Implement JSON-RPC Model Context Protocol (MCP) server for autonomous AI quant research.
- [ ] Real-time telemetry via Axum / WebSockets.

---

## Phase 5: Tauri 2.0 Desktop Application
- [ ] Bundle Web UI into native Tauri 2.0 desktop application for Linux, macOS, and Windows.
- [ ] Embedded SQLite database integration for local strategy storage and cached market data.
- [ ] Automated 03:00 AM session reset handler.
