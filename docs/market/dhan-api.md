# Dhan HQ API Architecture & Integration

## 1. Overview & Connection Architecture

**Dhan HQ API v2** ([dhanhq.co](https://dhanhq.co)) offers zero-cost subscription access to live execution and market feeds for Indian exchanges:

- **REST API Base**: `https://api.dhan.co/v2`
- **Historical Data API**: `https://api.dhan.co/v2/charts/historical`
- **Intraday Data API**: `https://api.dhan.co/v2/charts/intraday`
- **Market Feed WebSocket**: `wss://api-feed.dhan.co`
- **Order Stream WebSocket**: `wss://api-order.dhan.co`

---

## 2. Low-Latency Binary WebSocket Protocol

Dhan delivers market data via packed binary packets over WebSocket:
1. **Ticker Packet (Code 15)**: Fast 1-second price ticks containing Last Traded Price (LTP) and Last Traded Time.
2. **Quote Packet (Code 16)**: LTP, High, Low, Open, Close, Volume, and Day VWAP.
3. **Full Depth Packet (Code 17)**: 5-depth Level 2 Limit Order Book (Bid prices & quantities, Ask prices & quantities).

---

## 3. Rust Client Implementation Pattern

```rust
pub struct DhanClientConfig {
    pub client_id: String,
    pub access_token: String,
}

pub struct DhanMarketStream {
    config: DhanClientConfig,
    // Low-latency binary WebSocket parser built with Tokio-tungstenite
}

impl DhanMarketStream {
    pub async fn subscribe_instruments(&mut self, instrument_tokens: &[u32]) -> Result<()>;
    pub async fn next_market_event(&mut self) -> Option<MarketEvent>;
}
```

---

## 4. Rate Limits & Compliance
- **REST Order Placement**: 25 orders per second, 250 requests per minute.
- **Historical Data Queries**: 5 requests per second.
- **Session Management**: Authentication tokens expire daily at 03:00 AM IST; Honba's session manager automatically prompts or refreshes tokens.
