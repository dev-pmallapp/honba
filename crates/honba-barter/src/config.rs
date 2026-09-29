//! Backtest configuration.

use crate::model::{Product, Segment};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// Backtest configuration (JSON keys match field names, every key is optional, unknown keys
/// are ignored). See the crate docs for the full JSON contract.
///
/// | key                | type      | default     | meaning                                                   |
/// |--------------------|-----------|-------------|-----------------------------------------------------------|
/// | `symbols`          | [str]     | candle keys | Symbols to trade; defaults to every symbol with candles.  |
/// | `exchange`         | str       | `"NSE"`     | Venue label (reporting only; execution is barter's mock). |
/// | `quote`            | str       | `"INR"`     | Quote / cash currency.                                    |
/// | `initial_cash`     | float     | `1000000`   | Starting cash in `quote`.                                 |
/// | `fees_percent`     | float     | `0`         | Flat fee in **percent** of traded value (`0.03` = 0.03%). |
/// | `latency_ms`       | int       | `0`         | Simulated exchange latency, must be `< 500` (virtual time).|
/// | `risk_free_return` | float     | `0`         | Annual risk-free rate as a fraction (`0.065` = 6.5%).     |
/// | `allow_short`      | bool      | `false`     | Allow any short (otherwise cash equity needs MIS).        |
/// | `fill_model`       | str       | `"close"`   | `close` or `next_open`.                                   |
/// | `intrabar_priority`| str       | `stop_first`| Bracket tie-break (alias `same_bar_priority`).            |
/// | `start_ms`         | int       | `null`      | Warm-up bars before it.                                   |
/// | `costs`            | object    | `null`      | [`CostsConfig`]; `null` = flat `fees_percent`.            |
/// | `instruments`      | object    | `{}`        | Per-symbol [`InstrumentMeta`].                            |
/// | `session`          | object    | `null`      | [`SessionConfig`]; `null` = always open.                  |
/// | `trading_days_per_year` | int  | `250`       | Annualisation factor for sharpe / sortino / tear sheets.  |
/// | `attached_exit_same_bar` | bool | `false`   | Attached exits can trigger on the entry's bar (stop first).|
/// | `liquidate_at_end` | bool      | `false`     | Close all positions at the final bar's close.             |
/// | `margin`           | object    | 1x / 100%   | [`MarginConfig`]: `mis_leverage`, `nrml_margin_pct`, `short_margin_pct`. |
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
    /// Per-symbol instrument metadata; symbols without an entry are equity cash, lot 1, no
    /// tick validation.
    #[serde(skip_serializing_if = "BTreeMap::is_empty")]
    pub instruments: BTreeMap<String, InstrumentMeta>,
    /// Let an entry's attached stop loss / take profit trigger on the bar the entry filled in
    /// (intrabar entries: limit / stop / next_open fills), stop first. Default `false`: exits
    /// are active from the next bar (optimistic about same-bar stop-outs).
    pub attached_exit_same_bar: bool,
    /// Annualisation for sharpe / sortino and barter tear sheets (NSE: ~250 sessions).
    pub trading_days_per_year: u32,
    /// Close every open position at the final bar's close (reason `liquidate_end`,
    /// whatever the fill model) and cancel working orders (`end_of_data`).
    pub liquidate_at_end: bool,
    /// Margin required to open positions (see [`MarginConfig`]).
    pub margin: MarginConfig,
    /// Trading hours / holidays / MIS square-off; `null` = always open.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session: Option<SessionConfig>,
    /// Transaction cost model; `null` = flat `fees_percent`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub costs: Option<CostsConfig>,
    /// Which bracket exit wins when stop loss and take profit both trigger inside one bar.
    #[serde(alias = "same_bar_priority")]
    pub intrabar_priority: IntrabarPriority,
    /// `close` (default): market orders and orders marketable at the decision bar fill at its
    /// close. `next_open`: they fill at the next bar's open (resting orders match from the next
    /// bar either way).
    pub fill_model: FillModel,
    /// Bars before this timestamp (epoch ms) are warm-up: `on_bar` runs with `warmup: true`,
    /// orders are rejected (`warmup`) and the equity curve / metrics start here.
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
            session: None,
            margin: MarginConfig::default(),
            liquidate_at_end: false,
            trading_days_per_year: 250,
            attached_exit_same_bar: false,
            instruments: BTreeMap::new(),
            start_ms: None,
            fill_model: FillModel::Close,
        }
    }
}

/// `margin` config: fraction of notional blocked to open exposure, checked against
/// buying power = equity - margin blocked by open positions (marked at the latest close).
///
/// Short-sale proceeds never fund purchases (the short liability offsets them). Orders that
/// only reduce a position (exits, covering, MIS square-off) are never rejected; a loss beyond
/// equity (gap through a stop) is booked as is, so cash / equity can go negative only through
/// losses, never through new exposure.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct MarginConfig {
    /// Intraday leverage for MIS (margin = notional / mis_leverage), both sides.
    pub mis_leverage: f64,
    /// Margin percent for NRML / MTF longs and shorts (e.g. ~15-20 for futures).
    pub nrml_margin_pct: f64,
    /// Margin percent for other (CNC via `allow_short`) shorts.
    pub short_margin_pct: f64,
}

impl Default for MarginConfig {
    fn default() -> Self {
        Self {
            mis_leverage: 1.0,
            nrml_margin_pct: 100.0,
            short_margin_pct: 100.0,
        }
    }
}

impl MarginConfig {
    /// Fraction of notional blocked for a `product` position (`short` side).
    pub fn rate(&self, product: Product, short: bool) -> f64 {
        match product {
            Product::MIS => 1.0 / self.mis_leverage,
            Product::NRML | Product::MTF => self.nrml_margin_pct / 100.0,
            Product::CNC if short => self.short_margin_pct / 100.0,
            Product::CNC => 1.0,
        }
    }
}

/// `session` config.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct SessionConfig {
    /// `Asia/Kolkata` (default), `UTC` or a fixed offset such as `+05:30`.
    pub tz: String,
    /// Local open time `HH:MM`.
    pub open: String,
    /// Local close time `HH:MM` (exclusive: a bar stamped at the close is outside the session).
    pub close: String,
    /// MIS positions are closed (at the bar close, whatever the fill model) on the first
    /// in-session bar whose interval covers or follows this time, or on the last in-session
    /// bar of the date if none does (early end of data, daily bars). From that bar on, new
    /// MIS exposure that day is rejected (`after_square_off`).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mis_square_off: Option<String>,
    /// Exchange holidays `YYYY-MM-DD`.
    pub holidays: Vec<String>,
    /// Saturdays / Sundays are trading days (special sessions).
    pub trade_weekends: bool,
}

impl Default for SessionConfig {
    fn default() -> Self {
        Self {
            tz: "Asia/Kolkata".into(),
            open: "09:15".into(),
            close: "15:30".into(),
            mis_square_off: None,
            holidays: Vec::new(),
            trade_weekends: false,
        }
    }
}

/// `instruments.<symbol>` config: exchange rules for one symbol. Unknown keys are ignored.
#[derive(Debug, Clone, Copy, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct InstrumentMeta {
    pub segment: Segment,
    /// Order quantities must be multiples of this (`invalid_lot`).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lot_size: Option<f64>,
    /// Limit / trigger / stop-loss / take-profit prices must be multiples of this
    /// (`invalid_tick`); trailing stops are rounded to it.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tick_size: Option<f64>,
    /// Maximum quantity per order (`above_freeze_qty`).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub freeze_qty: Option<f64>,
    /// Product for orders that don't name one (default: CNC for equity cash, NRML otherwise).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_product: Option<Product>,
}

impl InstrumentMeta {
    pub fn default_product(&self) -> Product {
        self.default_product
            .unwrap_or_else(|| self.segment.default_product())
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

/// When market orders execute.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FillModel {
    #[default]
    Close,
    NextOpen,
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
