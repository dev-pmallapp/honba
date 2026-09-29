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
///
/// Further keys are documented on the fields below and in the crate docs.
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
    /// Transaction cost model; `null` = flat `fees_percent`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub costs: Option<CostsConfig>,
    /// Which bracket exit wins when stop loss and take profit both trigger inside one bar.
    #[serde(alias = "same_bar_priority")]
    pub intrabar_priority: IntrabarPriority,
    /// Bars before this timestamp (epoch ms) are warm-up.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub start_ms: Option<i64>,
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
            intrabar_priority: IntrabarPriority::StopFirst,
            costs: None,
            start_ms: None,
        }
    }
}

/// Transaction cost model.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CostModel {
    /// `fees_percent` of traded value on every fill.
    #[default]
    Flat,
    /// Indian statutory charges (STT, exchange, SEBI, stamp duty, GST) plus brokerage, per
    /// fill, by segment and product (`honba_core::IndianTaxCalculator::calculate_for`).
    India,
}

/// Broker charges for the `india` cost model.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct BrokerageConfig {
    /// Cap per executed order.
    pub per_order: f64,
    /// Percent of turnover (0.03 = 0.03%); brokerage = min(per_order, pct% x turnover).
    pub pct: f64,
    /// Delivery (CNC) is brokerage free.
    pub cnc_free: bool,
    /// DP charge per delivery sell.
    pub dp_per_sell: f64,
}

impl Default for BrokerageConfig {
    fn default() -> Self {
        Self {
            per_order: 20.0,
            pct: 0.03,
            cnc_free: true,
            dp_per_sell: 0.0,
        }
    }
}

/// The statutory rate table implemented by the `india` cost model.
pub const INDIA_RATE_TABLE: &str = "2024-10-01";

/// `costs` config key.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct CostsConfig {
    pub model: CostModel,
    pub brokerage: BrokerageConfig,
    /// Statutory rate table date; only `2024-10-01` (current NSE rates) is available.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub table: Option<String>,
}

/// Tie-break for a bracket whose stop loss and take profit both trigger within one bar.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum IntrabarPriority {
    /// Assume the stop loss was hit first (conservative).
    #[default]
    StopFirst,
    TargetFirst,
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
