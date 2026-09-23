# Execution Pipeline: Barter-Inspired Event Architecture

## 1. Unidirectional Strongly-Typed Pipeline

Honba enforces Barter's decoupled, event-driven pipeline:

```
[MarketEvent] ──> [Strategy Engine] ──> [Signal] ──> [RiskGuard] ──> [OrderEvent] ──> [Execution] ──> [FillEvent]
```

### Event Definitions
1. **`MarketEvent`**: An incoming tick or OHLCV candle from Dhan HQ or local Parquet historical data.
2. **`Signal`**: Output of strategy condition evaluation, representing directional trade bias.
3. **`RiskGuard`**: Validates signal against account rules (daily drawdown limits, circuit limits, peak margin, position concentration limits).
4. **`OrderEvent`**: Concrete trade intent specifying symbol, side, quantity, product code (`CNC`, `MIS`, `MTF`), order type (`MARKET`, `LIMIT`, `SL`), and price.
5. **`Execution`**: Routes the order to Dhan HQ REST/WebSocket API (live) or the local Order Book Matching Simulator (backtest).
6. **`FillEvent`**: Confirms execution with filled price, quantity, execution timestamp, and exact Indian tax charges.

---

## 2. Perfect Backtest / Live Parity

Because the Strategy and RiskGuard interface only with abstract traits, the exact same code runs in both historical backtests and live trading with zero changes.
