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
//! Contract version [`CONTRACT_VERSION`] = **3** (`_core.contract_version()`; also
//! `report.contract_version`). History: 1 = orders / brackets / trailing / sessions / costs;
//! 2 = `margin`, `liquidate_at_end`, `trading_days_per_year`, `attached_exit_same_bar`,
//! `report.round_trips` (net win rate / profit factor), reasons `no_bar`, `no_position`,
//! `insufficient_margin`, `end_of_data`, fill reason `liquidate_end`, role `liquidation`;
//! 3 = `slippage` (bps / volume share, `max_volume_share` partial fills: order status
//! `partially_filled`, fill `remaining_qty`); `instruments.*.price_band_pct` (reason
//! `outside_price_band`, circuit-locked bars); `freeze_policy` (`split`: freeze-sized slices,
//! fill / trade `slice`); `stop_loss` / `take_profit` leg lists (partial exits),
//! `move_sl_to_entry_after_first_tp`, leg ids `<id>:sl<n>` / `<id>:tp<n>`, cancel reason
//! `replaced`, event `stop_update`.
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
//!   "trading_days_per_year": 250,    // annualisation (sharpe, sortino, barter tear sheets)
//!   "liquidate_at_end": false,       // close everything at the final bar's close
//!   "attached_exit_same_bar": false, // attached exits may trigger on the entry's bar
//!   "margin": {"mis_leverage": 1.0, "nrml_margin_pct": 100.0, "short_margin_pct": 100.0},
//!   "slippage": {"model": "bps" | "volume_share", "bps": 0.0, "impact_bps": 0.0,
//!                "max_volume_share": null},   // see config::SlippageConfig
//!   "freeze_policy": "reject" | "split",   // orders above freeze_qty: reject, or execute
//!                                          // each fill as freeze-sized lot-multiple slices
//!   "costs": {"model": "flat" | "india",
//!             "brokerage": {"per_order": 20, "pct": 0.03, "cnc_free": true, "dp_per_sell": 0},
//!             "table": "2024-10-01"},
//!   "instruments": {"NIFTYFUT": {"segment": "equity_cash" | "equity_futures" |
//!                     "equity_options" | "commodity" | "currency",
//!                    "lot_size": 75, "tick_size": 0.05, "freeze_qty": 1800,
//!                    "price_band_pct": 20.0,   // circuit band, % of previous session close
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
//!  // or lists of legs (partial exits): lot multiples summing to <= qty; a leg without
//!  // qty / pct takes the rest (one per list)
//!  "take_profit": [{"price": 840.0, "qty": 5}, {"price": 860.0, "pct": 25}, {"price": 880.0}],
//!  "move_sl_to_entry_after_first_tp": false,  // first target fill moves the stop to entry
//!  "trail": {"mode": "percent" | "amount" | "atr", "value": 1.5, "atr_period": 14,
//!            "activation_price": 820.0, "step": 0.5}}
//!    // trail trails the attached stop loss (a single level; with a list of stop-loss legs:
//!    // unsupported_trail); on a "stop" order without stop_loss it trails its own trigger
//!    // Bracket legs: each side (stop loss / take profit) covers the entry's open quantity;
//!    // when a leg fills, the other side's legs shrink (last leg first) so they never exceed
//!    // it, and legs left without quantity once the entry is done are cancelled ("oco").
//!    // A single stop loss therefore always covers what the target legs leave.
//! {"op": "modify", "id": "e1", "qty": .., "price": .., "trigger": .., "tif": ..,
//!  "stop_loss": .., "take_profit": .., "trail": {..}, "tag": ..}  // exits via entry or "<id>:sl"
//!    // a stop_loss / take_profit level moves every working leg of that side; a list
//!    // replaces them (old legs cancelled "replaced", new legs numbered on)
//! {"op": "cancel", "id": "e1"}
//! {"op": "cancel_all", "symbol": "SBIN"}   // symbol optional
//! ```
//!
//! Ids are unique per run; generated ids are `o<n>`; attached exits are `<id>:sl` / `<id>:tp`
//! (single level) or `<id>:sl<n>` / `<id>:tp<n>` (legs), and these suffixes are reserved.
//! Rejection reasons: `unknown_symbol`, `invalid_qty`, `invalid_price`, `invalid_trigger`,
//! `invalid_stop_loss`, `invalid_take_profit`, `invalid_trail`, `unsupported_trail`,
//! `invalid_lot`, `invalid_tick`, `above_freeze_qty`, `outside_price_band` (the order's own
//! limit / trigger, placed or modified, outside today's band), `no_price`, `duplicate_id`,
//! `unknown_order`, `order_closed`, `not_an_entry`, `market_closed`, `after_square_off`,
//! `warmup`, `no_bar` (market order on a symbol without a bar at this timestamp, close fill
//! model), `no_position` (exit change on an entry whose position is closed), and at fill time
//! `insufficient_cash` (CNC buy), `insufficient_margin`, `insufficient_position` (short not
//! allowed: cash equity needs MIS or `allow_short`), `exchange: ...`. Cancel reasons: `user`,
//! `oco`, `position_closed`, `parent_closed`, `replaced`, `square_off`, `end_of_data`;
//! expire: `day`, `ioc`.
//!
//! Margin: opening exposure needs `notional x rate` of buying power (= equity - margin of open
//! positions): rate = 1/`mis_leverage` for MIS, `nrml_margin_pct` for NRML/MTF, 100% for CNC
//! longs, `short_margin_pct` for CNC shorts. Short proceeds never fund buys; reducing orders
//! are never rejected (losses beyond equity are booked as is).
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
//!     "stop_loss" | "take_profit" | "trailing_stop" | "square_off" | "liquidate_end",
//!     "remaining_qty",                // order quantity still working after this fill
//!     "slice"},                       // "<id>#<n>", only for freeze_policy split slices
//!    {"type": "cancel" | "expire", "time_ms", "id", "symbol", "reason"},
//!    {"type": "reject", "time_ms", "id", "symbol", "side", "qty", "reason"},
//!    {"type": "trail_update", "time_ms", "id", "symbol", "old_stop", "new_stop"},
//!    {"type": "stop_update", "time_ms", "id", "symbol", "old_stop", "new_stop",
//!     "reason": "move_sl_to_entry"}],
//!  "session": {"is_open": bool, "date": "YYYY-MM-DD", "minutes_to_close": int|null}}
//! Order = {"id", "symbol", "side", "kind", "qty", "filled_qty", "avg_fill_price", "price",
//!          "trigger", "tif", "product", "tag", "role": "entry" | "stop_loss" | "take_profit" |
//!          "square_off" | "liquidation", "parent", "status": "open" | "pending" |
//!          "partially_filled" | "filled" | "cancelled" | "expired" | "rejected", "reason",
//!          "stop_loss", "take_profit" (entries: level of the first working leg), "trail",
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
//!
//! Price bands: with `price_band_pct`, the band is `previous trading date's last close x (1 +-
//! pct%)` (on the tick; none on the first date). A bar locked at a band (`high == low` at the
//! upper / lower band) fills no buy / sell orders of any kind (they keep working; a stop that
//! triggered executes at a later open); MIS square-off and `liquidate_at_end` still execute.
//!
//! Partial fills: with `slippage.max_volume_share` an order may fill over several bars; it is
//! `partially_filled` while working, a triggered stop's rest executes at later opens, IOC
//! remainders expire, DAY remainders expire with their session. Attached exits cover the
//! filled quantity of their entry.

/// Version of the `_core.run_backtest` JSON contract (config, actions, ctx, report).
pub const CONTRACT_VERSION: u32 = 3;

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
    BacktestConfig, BrokerageConfig, CostModel, CostsConfig, FillModel, FreezePolicy,
    InstrumentMeta, IntrabarPriority, MarginConfig, SessionConfig, SlippageConfig, SlippageModel,
};
pub use data::{Bar, BarGate, CandleData, CandleMarketData};
pub use ledger::Ledger;
pub use model::{
    parse_actions, Action, ActionSide, BarContext, CostBreakdown, Event, ExitLeg, ExitSpec,
    FillEvent, FillReason, ModifyRequest, OrderRequest, OrderRole, OrderStatus, OrderType,
    OrderView, PositionView, Product, Segment, SessionView, TimeInForce, TrailMode, TrailSpec,
};
pub use report::{
    round_trips, BacktestReport, InstrumentMetrics, RoundTrip, SummaryMetrics, TradeRecord,
    TradingYear,
};
pub use strategy::{Decider, DeciderError, DeciderStrategy, HonbaEngineState};
