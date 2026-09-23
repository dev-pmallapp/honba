# Barter-rs: High-Performance Event-Driven Architecture

## 1. Overview & Core Philosophy

**Barter-rs** ([github.com/barter-rs/barter-rs](https://github.com/barter-rs/barter-rs)) is an open-source, ultra-high-performance algorithmic trading ecosystem written in native Rust.

Its design philosophy centers on:
1. **100% Backtest-to-Live Parity**: The same strategy and risk logic run in historical backtesting and live production trading without code modifications.
2. **Zero-Cost Abstractions & Minimal Allocations**: Low latency with $O(1)$ lookups and zero heap allocations in the critical hot path.
3. **Fearless Concurrency**: Powered by Tokio's asynchronous multi-threaded runtime.
4. **Compile-Time Safety**: Strong type systems preventing erroneous order submissions or financial math precision bugs.

---

## 2. Event Pipeline Architecture

Barter's core engine coordinates a unidirectional flow of strongly-typed events:

```
+---------------------------------------------------------------------------------------+
|                             BARTER-RS EVENT PIPELINE                                  |
+---------------------------------------------------------------------------------------+
|                                                                                       |
|   +-----------------------+                                                           |
|   |      MarketEvent      |  (Tick, 1-min Candle, or Level 2 Order Book update)       |
|   +-----------+-----------+                                                           |
|               |                                                                       |
|               v                                                                       |
|   +-----------------------+                                                           |
|   |       Strategy        |  Evaluates indicator state & market signals               |
|   +-----------+-----------+                                                           |
|               |                                                                       |
|               v                                                                       |
|   +-----------------------+                                                           |
|   |        Signal         |  Directional intent (Long, Short, Neutral)                |
|   +-----------+-----------+                                                           |
|               |                                                                       |
|               v                                                                       |
|   +-----------------------+                                                           |
|   |      RiskManager      |  Validates position size, leverage, margin, capital caps  |
|   +-----------+-----------+                                                           |
|               |                                                                       |
|               v                                                                       |
|   +-----------------------+                                                           |
|   |      OrderEvent       |  Concrete order ticket (Symbol, Side, Qty, Type, Price)   |
|   +-----------+-----------+                                                           |
|               |                                                                       |
|               v                                                                       |
|   +-----------------------+                                                           |
|   |    ExecutionEngine    |  Simulates fill against LOB (backtest) or sends to broker |
|   +-----------+-----------+                                                           |
|               |                                                                       |
|               v                                                                       |
|   +-----------------------+                                                           |
|   |       FillEvent       |  Execution confirmation with fees, slippage, and fills    |
|   +-----------------------+                                                           |
+---------------------------------------------------------------------------------------+
```

---

## 3. Modular Crates in the Ecosystem

* **`barter`**: The core framework containing the `Engine`, execution pipeline, order routing, portfolio accounting, and `RiskManager` abstractions.
* **`barter-data`**: High-performance, normalized WebSocket ingestion streams for streaming public tick-by-tick market data.
* **`barter-execution`**: Out-of-the-box infrastructure for handling live order lifecycles, retries, and exchange communication.
* **`barter-integration`**: Underlying network infrastructure providing resilient WebSocket and HTTP clients with automatic reconnection and ping-pong heartbeats.

---

## 4. Key Takeaways for Honba

1. **Adopt the Pipeline**: Honba implements Barter's `MarketEvent -> Strategy -> RiskGuard -> OrderEvent -> Execution -> FillEvent` trait architecture in Rust.
2. **Backtest / Live Parity**: A strategy written once can run on historical Dhan Parquet archives or stream live through Dhan HQ WebSockets.
3. **Decoupled Risk Guard**: Risk rules (max drawdown, circuit breakers, Indian margin checks) are segregated from strategy alpha logic.
