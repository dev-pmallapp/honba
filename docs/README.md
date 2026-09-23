# Honba Documentation Index

Welcome to the documentation suite for **Honba** — an institutional-grade quantitative research, backtesting, and automated strategy validation platform designed for the **Indian Financial Markets**, built with **Rust + Python**, featuring a **TradingView-styled Web UI & CLI**, native **Tauri 2.0 desktop support**, and an **AI Quant Agent (MCP)**.

---

## Hierarchical Documentation Map

### 1. [Research](file:///home/pmallapp/Devel/Finance/honba.git/docs/research)
* **[Jesse AI Analysis](file:///home/pmallapp/Devel/Finance/honba.git/docs/research/jesse-ai.md)**: Teardown of Jesse's crypto trading framework, strategy lifecycle, and Model Context Protocol (MCP) server integration.
* **[Barter-rs Analysis](file:///home/pmallapp/Devel/Finance/honba.git/docs/research/barter-rs.md)**: Investigation into Barter's pure Rust unidirectional event pipeline, zero-allocation data paths, and 100% backtest/live parity.
* **[OpenAlgo Desktop Analysis](file:///home/pmallapp/Devel/Finance/honba.git/docs/research/openalgo.md)**: Examination of OpenAlgo Desktop's Tauri 2.0 + Rust architecture, hardware OS keyring security, and 33+ Indian broker integrations.
* **[TickGrinder Analysis](file:///home/pmallapp/Devel/Finance/honba.git/docs/research/tickgrinder.md)**: Deep dive into actor/worker concurrency with independent Tick Processors and central Optimizer supervisor.
* **[Comparative Analysis & Synthesis](file:///home/pmallapp/Devel/Finance/honba.git/docs/research/comparative-analysis.md)**: The 4-pillar inspiration matrix and feature selection mapping for Honba.

---

### 2. [Indian Market Specifics](file:///home/pmallapp/Devel/Finance/honba.git/docs/market)
* **[Microstructure & Sessions](file:///home/pmallapp/Devel/Finance/honba.git/docs/market/microstructure.md)**: Pre-open equilibrium auction (09:00–09:08), continuous trading, 15:15 MIS auto-square-off, circuit breakers, and $T+1$/$T+0$ settlement.
* **[Multi-Asset Instruments](file:///home/pmallapp/Devel/Finance/honba.git/docs/market/instruments.md)**: Equities (CNC/MIS), Factor Indices (NIFTY Alpha 50, NIFTY 200 Alpha 30), ETFs (NIFTYBEES, LIQUIDBEES), Mutual Funds, Corporate Bonds, and F&O derivatives.
* **[Taxation & Fee Matrix](file:///home/pmallapp/Devel/Finance/honba.git/docs/market/taxation-and-fees.md)**: Exact Indian tax calculations: STT (Budget 2024 rates), GST (18%), Stamp Duty, Exchange turnover charges, SEBI fees, and DP charges.
* **[Dhan HQ API Integration](file:///home/pmallapp/Devel/Finance/honba.git/docs/market/dhan-api.md)**: REST endpoints, binary WebSocket feeds (LTP, Quote, 5-depth LOB), rate limits, and authentication.

---

### 3. [Architecture](file:///home/pmallapp/Devel/Finance/honba.git/docs/architecture)
* **[Master System Design](file:///home/pmallapp/Devel/Finance/honba.git/docs/architecture/system-design.md)**: High-level subsystem topology, data flows, and cross-cutting design principles.
* **[Rust Core Engine](file:///home/pmallapp/Devel/Finance/honba.git/docs/architecture/rust-core.md)**: Precision decimal arithmetic, SIMD indicators, Apache Arrow memory buffers, and Rayon multi-threaded backtest parallelization.
* **[Python Strategy Layer](file:///home/pmallapp/Devel/Finance/honba.git/docs/architecture/python-layer.md)**: Jesse-style declarative Python strategy DSL and PyO3 zero-copy FFI bridge.
* **[Execution Pipeline](file:///home/pmallapp/Devel/Finance/honba.git/docs/architecture/execution-pipeline.md)**: Barter-inspired `MarketEvent -> Signal -> RiskGuard -> OrderEvent -> Execution -> FillEvent` pipeline.
* **[Actor/Worker Concurrency](file:///home/pmallapp/Devel/Finance/honba.git/docs/architecture/actor-model.md)**: TickGrinder-inspired multi-symbol worker tasks and master portfolio supervisor node.

---

### 4. [Anti-Overfitting Methodology](file:///home/pmallapp/Devel/Finance/honba.git/docs/methodology)
* **[Statistical Rigor & Anti-Overfitting](file:///home/pmallapp/Devel/Finance/honba.git/docs/methodology/anti-overfitting.md)**: Addressing multiple testing bias (p-hacking), Probability of Backtest Overfitting (PBO), and Deflated Sharpe Ratio (DSR).
* **[Cross-Validation Suite](file:///home/pmallapp/Devel/Finance/honba.git/docs/methodology/cross-validation.md)**: Combinatorial Purged Cross-Validation (CPCV), Purging and Embargoing proofs.
* **[Execution Stress Testing](file:///home/pmallapp/Devel/Finance/honba.git/docs/methodology/stress-testing.md)**: Slippage multipliers ($1.5\times$ to $3.0\times$ spread), latency injection (500–3000ms), and Monte Carlo permutations.

---

### 5. [Interfaces](file:///home/pmallapp/Devel/Finance/honba.git/docs/interfaces)
* **[Web UI Design System](file:///home/pmallapp/Devel/Finance/honba.git/docs/interfaces/web-ui.md)**: TradingView-inspired aesthetic, `#131722` dark palette, TradingView Lightweight Charts, and Strategy Tester dock.
* **[Tauri Desktop Application](file:///home/pmallapp/Devel/Finance/honba.git/docs/interfaces/desktop-app.md)**: Native desktop bundle, embedded SQLite database, and OS Keyring security (`keyring-rs`).
* **[Terminal CLI](file:///home/pmallapp/Devel/Finance/honba.git/docs/interfaces/terminal-cli.md)**: Interactive terminal workflows with Rich tables and ASCII drawdown charts.
* **[AI Quant Agent (MCP)](file:///home/pmallapp/Devel/Finance/honba.git/docs/interfaces/ai-agent-mcp.md)**: Model Context Protocol (MCP) server endpoints allowing AI assistants to autonomously formulate and audit strategies.

---

### 6. [Roadmap & Directory Structure](file:///home/pmallapp/Devel/Finance/honba.git/docs/roadmap)
* **[Project Milestones](file:///home/pmallapp/Devel/Finance/honba.git/docs/roadmap/project-milestones.md)**: Phased execution plan from Rust core engine to native Tauri 2.0 release.
* **[Codebase Directory Structure](file:///home/pmallapp/Devel/Finance/honba.git/docs/roadmap/directory-structure.md)**: Monorepo crate and package layout.
