# Actor/Worker Architecture: Multi-Asset Concurrency

## 1. TickGrinder-Inspired Worker Concurrency

When scanning multi-asset universes (e.g., NIFTY 200 constituents, sector indices, or complex option chains), sequential evaluation creates latency bottlenecks. Honba adopts an actor/worker model:

```
+-------------------------------------------------------------------------------+
|                            ACTOR CONCURRENCY MODEL                            |
+-------------------------------------------------------------------------------+
|                                                                               |
|                      +---------------------------------+                      |
|                      |   Master Supervisor (Optimizer) |                      |
|                      |  - Account Margin Controller    |                      |
|                      |  - Global Drawdown Veto         |                      |
|                      +----------------+----------------+                      |
|                                       |                                       |
|             +-------------------------+-------------------------+             |
|             | (Tokio mpsc / Crossbeam In-Memory Channels)       |             |
|             v                                                   v             |
|   +-----------------------+                           +-----------------------+
|   |    Tick Processor     |                           |    Tick Processor     |
|   |  - Instrument: INFY   |                           |  - Instrument: TCS    |
|   |  - Local Ring Buffer  |                           |  - Local Ring Buffer  |
|   |  - Indicator State    |                           |  - Indicator State    |
|   +-----------------------+                           +-----------------------+
+-------------------------------------------------------------------------------+
```

---

## 2. In-Memory Communication
- Replaces legacy network pub/sub (Redis) with **Tokio `mpsc`** and **`crossbeam`** lock-free ring buffers.
- Zero network hops, sub-microsecond internal latency, and thread isolation across symbols.
