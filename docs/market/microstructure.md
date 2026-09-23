# Indian Market Microstructure & Session Mechanics

## 1. Trading Sessions & Timing Schedule

The Indian financial markets operate on strict timeframes coordinated across the National Stock Exchange (NSE) and Bombay Stock Exchange (BSE):

| Session Phase | Timing (IST) | Market Behavior & Engine Mechanics |
| :--- | :--- | :--- |
| **Pre-Open Order Entry** | 09:00:00 - 09:08:00 | Orders can be entered, modified, or canceled. No matching occurs. |
| **Pre-Open Order Matching** | 09:08:00 - 09:12:00 | Multilateral order matching to discover the opening equilibrium price. Crucial for gap-up/gap-down modeling. |
| **Buffer Period** | 09:12:00 - 09:15:00 | System transition to continuous trading. |
| **Continuous Trading (Equities & F&O)** | 09:15:00 - 15:30:00 | Continuous double-auction limit order book (LOB). |
| **Intraday Auto-Square-Off Window** | 15:15:00 - 15:25:00 | Brokers automatically square off unclosed MIS positions. The backtest simulator must account for forced market exits during this window. |
| **Closing Price Determination** | 15:00:00 - 15:30:00 | Official closing price is calculated as the Volume-Weighted Average Price (VWAP) of the last 30 minutes, not the last traded tick. |
| **Post-Market Session** | 15:40:00 - 16:00:00 | Trading at the discovered official closing price. |
| **Commodity Evening Session (MCX)** | 09:00:00 - 23:30/23:55 | Continuous trading for commodities (linked to US/global market hours). |
| **Muhurat Trading** | 1 Hour on Diwali | Special auspicious trading session held annually in the evening. |

---

## 2. Market Safeguards & Settlement

### 2.1 Circuit Breakers
- **Index Circuit Breakers**: 10%, 15%, and 20% movements in NIFTY 50 or SENSEX trigger market-wide trading halts lasting from 45 minutes to the remainder of the trading day.
- **Stock Price Bands**: Individual equities are subject to 2%, 5%, 10%, or 20% daily price bands. (Stocks with active F&O contracts have dynamic operating ranges without fixed hard circuits).

### 2.2 Surveillance Frameworks (ASM & GSM)
- **Additional Surveillance Measure (ASM)** and **Graded Surveillance Measure (GSM)**: Imposed by SEBI on volatile or illiquid securities. Requires 100% upfront margin, caps daily price movement to 5%, and disables intraday leverage.

### 2.3 Settlement Cycles
- Equities settle on a $T+1$ cycle (with gradual transition to optional instantaneous $T+0$ settlement).
- Capital from delivery sales becomes available according to SEBI peak margin and settlement timelines.
