//! Honba Barter: bar-based backtesting on top of the [barter](https://github.com/barter-rs/barter-rs)
//! engine.
//!
//! - [`CandleData`]: candle-aware barter `InstrumentDataState` (barter's default ignores candles).
//! - [`Decider`] + [`DeciderStrategy`]: plug bar-by-bar trading logic into barter's `Engine`.
//! - [`run_backtest`] / [`run_sweep`]: replay OHLCV bars through `barter::backtest::backtest`
//!   with barter's mock execution and return a serializable [`BacktestReport`].
//! - [`book::Book`]: honba's order book (limit / stop / stop-limit, brackets, trailing stops,
//!   sessions, Indian costs) on top of barter's market-only mock exchange.
//!
//! # `_core.run_backtest(config_json, candles, on_bar) -> report_json` contract
//!
//! `candles`: `{symbol: [(time_ms, open, high, low, close, volume), ...]}`. `on_bar(ctx)` is
//! called once per distinct bar timestamp and returns a list of actions (or `None`). Every key
//! below is optional unless marked required; unknown keys are ignored everywhere.
//!
//! ## Config ([`BacktestConfig`])
//!
//! ```jsonc
//! {
//!   "symbols": ["SBIN"],             // default: every symbol in candles
//!   "exchange": "NSE", "quote": "INR",   // labels (execution is barter's mock)
//!   "initial_cash": 1000000,
//!   "fees_percent": 0.0,             // flat cost model: percent of traded value (0.03 = 0.03%)
//!   "latency_ms": 0,                 // < 500; simulated in virtual time
//!   "risk_free_return": 0.0,         // annual fraction, for sharpe / sortino
//!   "allow_short": false,            // legacy: allow any short (incl. CNC cash equity)
//!   "fill_model": "close",           // "close" | "next_open"
//!   "intrabar_priority": "stop_first", // alias "same_bar_priority"; or "target_first"
//!   "start_ms": null,                // warm-up: bars before it place no orders, no metrics
//!   "costs": {"model": "flat" | "india",
//!             "brokerage": {"per_order": 20, "pct": 0.03, "cnc_free": true, "dp_per_sell": 0},
//!             "table": "2024-10-01"},
//!   "instruments": {"NIFTYFUT": {"segment": "equity_cash" | "equity_futures" |
//!                     "equity_options" | "commodity" | "currency",
//!                    "lot_size": 75, "tick_size": 0.05, "freeze_qty": 1800,
//!                    "default_product": "CNC" | "MIS" | "NRML" | "MTF"}},
//!   "session": {"tz": "Asia/Kolkata", "open": "09:15", "close": "15:30",
//!               "mis_square_off": "15:20", "holidays": ["2025-10-21"],
//!               "trade_weekends": false}
//! }
//! ```
//!
//! ## Actions ([`Action`], returned by `on_bar`)
//!
//! ```jsonc
//! // place ("op" may be omitted); required: symbol, side, qty
//! {"op": "place", "id": "e1", "symbol": "SBIN", "side": "buy" | "sell", "qty": 10,
//!  "kind": "market" | "limit" | "stop" | "stop_limit",  // stop = SL-M, stop_limit = SL
//!  "price": 812.35,      // limit price (limit, stop_limit)
//!  "trigger": 815.0,     // trigger (stop, stop_limit); a trailing stop may omit it
//!  "tif": "day" | "ioc" | "gtc",          // default day
//!  "product": "CNC" | "MIS" | "NRML" | "MTF", // default: product of the position it reduces,
//!                                          // else the instrument default
//!  "tag": "breakout", "reduce_only": false,
//!  "stop_loss": 790.0, "take_profit": 840.0, // attached OCO exits, active after the entry fills
//!  "trail": {"mode": "percent" | "amount" | "atr", "value": 1.5, "atr_period": 14,
//!            "activation_price": 820.0, "step": 0.5}}
//!    // trail trails the attached stop loss; on a "stop" order without stop_loss it trails
//!    // the order's own trigger
//! {"op": "modify", "id": "e1", "qty": .., "price": .., "trigger": .., "tif": ..,
//!  "stop_loss": .., "take_profit": .., "trail": {..}, "tag": ..}  // exits via entry or "<id>:sl"
//! {"op": "cancel", "id": "e1"}
//! {"op": "cancel_all", "symbol": "SBIN"}   // symbol optional
//! ```
//!
//! Ids are unique per run; generated ids are `o<n>`; attached exits are `<id>:sl` / `<id>:tp`.
//! Rejection reasons: `unknown_symbol`, `invalid_qty`, `invalid_price`, `invalid_trigger`,
//! `invalid_stop_loss`, `invalid_take_profit`, `invalid_trail`, `unsupported_trail`,
//! `invalid_lot`, `invalid_tick`, `above_freeze_qty`, `no_price`, `duplicate_id`,
//! `unknown_order`, `order_closed`, `not_an_entry`, `market_closed`, `after_square_off`,
//! `warmup`, and at fill time `insufficient_cash`, `insufficient_position` (short not allowed:
//! cash equity needs MIS or `allow_short`), `exchange: ...`.
//!
//! ## Bar context (`ctx`, [`model::BarContextPayload`])
//!
//! ```jsonc
//! {"time_ms": int, "warmup": bool, "cash": float, "equity": float,
//!  "candles": {"SBIN": {"time_ms", "open", "high", "low", "close", "volume"}}, // latest bar
//!  "positions": {"SBIN": {"qty", "avg_price", "product": "CNC"|null, "realised_pnl",
//!                         "unrealised_pnl", "pnl"}},
//!  "open_orders": [Order],           // open + pending (attached exits awaiting their entry)
//!  "events": [                       // since the previous on_bar, in order
//!    {"type": "fill", "time_ms", "id", "fill_id", "symbol", "side", "qty", "price", "value",
//!     "costs": Costs, "realised_pnl", "product", "tag", "reason": "signal" | "limit" | "stop" |
//!     "stop_loss" | "take_profit" | "trailing_stop" | "square_off"},
//!    {"type": "cancel" | "expire", "time_ms", "id", "symbol", "reason"},
//!    {"type": "reject", "time_ms", "id", "symbol", "side", "qty", "reason"},
//!    {"type": "trail_update", "time_ms", "id", "symbol", "old_stop", "new_stop"}],
//!  "session": {"is_open": bool, "date": "YYYY-MM-DD", "minutes_to_close": int|null}}
//! Order = {"id", "symbol", "side", "kind", "qty", "filled_qty", "avg_fill_price", "price",
//!          "trigger", "tif", "product", "tag", "role": "entry" | "stop_loss" | "take_profit" |
//!          "square_off", "parent", "status": "open" | "pending" | "filled" | "cancelled" |
//!          "expired" | "rejected", "reason", "stop_loss", "take_profit", "trail",
//!          "trail_stop", "created_ms", "updated_ms"}
//! Costs = {"brokerage", "stt", "exchange_fee", "sebi_fee", "stamp_duty", "gst", "dp", "total"}
//! ```
//!
//! ## Report
//!
//! See [`report`] for the JSON schema.
//!
//! # Execution model
//!
//! Per bar timestamp: expire `day` orders of finished sessions, match resting orders against
//! each bar (exits before entries; see [`book`] for the price rules), update trailing stops,
//! square off MIS positions, apply the fills, call `on_bar`, execute what is immediately
//! executable (close fill model) and record the equity point. Every fill is executed through
//! barter's mock exchange as a market order at the computed price.

pub mod backtest;
pub mod book;
pub mod config;
pub mod data;
pub mod ledger;
pub mod model;
pub mod report;
pub mod session;
pub mod strategy;

pub use backtest::{run_backtest, run_sweep, BacktestError};
pub use config::{
    BacktestConfig, BrokerageConfig, CostModel, CostsConfig, FillModel, InstrumentMeta,
    IntrabarPriority, SessionConfig,
};
pub use data::{Bar, BarGate, CandleData, CandleMarketData};
pub use ledger::Ledger;
pub use model::{
    parse_actions, Action, ActionSide, BarContext, CostBreakdown, Event, FillEvent, FillReason,
    ModifyRequest, OrderRequest, OrderRole, OrderStatus, OrderType, OrderView, PositionView,
    Product, Segment, SessionView, TimeInForce, TrailMode, TrailSpec,
};
pub use report::{BacktestReport, InstrumentMetrics, SummaryMetrics, TradeRecord};
pub use strategy::{Decider, DeciderError, DeciderStrategy, HonbaEngineState};
