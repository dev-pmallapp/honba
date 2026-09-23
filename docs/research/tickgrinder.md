# TickGrinder: Actor-Based Tick Processing & Central Optimizer

## 1. Overview & Architecture

**TickGrinder** ([github.com/Ameobea/tickgrinder](https://github.com/Ameobea/tickgrinder)) is an open-source, high-performance algorithmic trading platform written in Rust by Ameobea.

While archived in early pre-alpha, TickGrinder introduced a groundbreaking **actor/worker concurrency architecture** designed specifically for high-throughput, low-latency market data processing.

```
+-----------------------------------------------------------------------------------+
|                            TICKGRINDER SYSTEM TOPOLOGY                            |
+-----------------------------------------------------------------------------------+
|                                                                                   |
|                      +-------------------------------------+                      |
|                      |      Central Optimizer / Supervisor |                      |
|                      |  - Dynamic Parameter Adjustment     |                      |
|                      |  - Strategy Health Monitoring       |                      |
|                      |  - Global Portfolio Circuit Breaker |                      |
|                      +------------------+------------------+                      |
|                                         |                                         |
|                 +-----------------------+-----------------------+                 |
|                 | (Pub/Sub Messaging Bus / Inter-Process IPC)   |                 |
|                 v                                               v                 |
|   +---------------------------+                   +---------------------------+   |
|   |   Tick Processor #1       |                   |   Tick Processor #N       |   |
|   |  - Symbol: NIFTY 50       |                   |  - Symbol: RELIANCE       |   |
|   |  - Local Indicator State  |                   |  - Local Indicator State  |   |
|   |  - Signal Trigger Logic   |                   |  - Signal Trigger Logic   |   |
|   +---------------------------+                   +---------------------------+   |
+-----------------------------------------------------------------------------------+
```

---

## 2. Key Architectural Innovations

### 2.1 Independent Tick Processors
Instead of processing all market ticks in a single monolithic thread:
- Each data stream or traded symbol is allocated a dedicated worker instance (**Tick Processor**).
- A Tick Processor maintains its own isolated ring buffer, computes localized technical indicators, and checks entry conditions without locking or blocking other instruments.
- If one instrument encounters abnormal data or latency spikes, other symbols continue executing uninterrupted.

### 2.2 Central Optimizer (Supervisor Node)
TickGrinder separated the execution of trading conditions from their optimization:
- Only one **Optimizer** runs at any time, overseeing all active Tick Processors.
- It dynamically adjusts thresholds, toggles strategies on/off based on market regime detection, and communicates with storage and external services.

### 2.3 Sub-Millisecond Tick-Level Resolution
- Designed specifically for raw tick processing (bid, ask, trade volume) rather than relying exclusively on aggregated 1-minute or 5-minute bars.

---

## 3. Key Takeaways for Honba

1. **Worker Model**: Utilize Tokio tasks or Rayon workers as dedicated **Tick Processors** for multi-symbol scanning (e.g. scanning the NIFTY 200 or active option chains).
2. **Central Supervisor**: Embed an Optimizer/Supervisor in Rust that manages account-wide drawdowns and adjusts parameters dynamically.
3. **In-Memory IPC**: Replace TickGrinder's Redis IPC with Rust's ultra-fast in-memory channels (Tokio `mpsc` / `crossbeam`).
