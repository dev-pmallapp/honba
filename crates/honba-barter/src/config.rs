//! Backtest configuration.

use serde::{Deserialize, Serialize};

/// Backtest configuration (JSON keys match field names, every key is optional).
///
/// | key                | type      | default     | meaning                                                   |
/// |--------------------|-----------|-------------|-----------------------------------------------------------|
/// | `symbols`          | [str]     | candle keys | Symbols to trade; defaults to every symbol with candles.  |
/// | `exchange`         | str       | `"NSE"`     | Venue label (reporting only; execution is barter's mock). |
/// | `quote`            | str       | `"INR"`     | Quote / cash currency.                                    |
/// | `initial_cash`     | float     | `1000000`   | Starting cash in `quote`.                                 |
/// | `fees_percent`     | float     | `0`         | Fee in **percent** of traded value (`0.03` = 0.03%).      |
/// | `latency_ms`       | int       | `0`         | Simulated exchange latency, must be `< 500` (virtual time).|
/// | `risk_free_return` | float     | `0`         | Annual risk-free rate as a fraction (`0.065` = 6.5%).     |
/// | `allow_short`      | bool      | `false`     | Allow sells beyond the current long position.             |
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct BacktestConfig {
    pub symbols: Vec<String>,
    pub exchange: String,
    pub quote: String,
    pub initial_cash: f64,
    pub fees_percent: f64,
    pub latency_ms: u64,
    pub risk_free_return: f64,
    pub allow_short: bool,
}

impl Default for BacktestConfig {
    fn default() -> Self {
        Self {
            symbols: Vec::new(),
            exchange: "NSE".to_string(),
            quote: "INR".to_string(),
            initial_cash: 1_000_000.0,
            fees_percent: 0.0,
            latency_ms: 0,
            risk_free_return: 0.0,
            allow_short: false,
        }
    }
}

/// barter's execution layer times out requests after 1s; a round trip costs 2 x latency.
pub const MAX_LATENCY_MS: u64 = 499;

impl BacktestConfig {
    pub fn from_json(json: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_str(json)
    }

    /// Fee as a fraction of traded value.
    pub fn fee_rate(&self) -> f64 {
        self.fees_percent / 100.0
    }
}
