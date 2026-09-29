//! Honba Barter: bar-based backtesting on top of the [barter](https://github.com/barter-rs/barter-rs)
//! engine.
//!
//! - [`CandleData`]: candle-aware barter `InstrumentDataState` (barter's default ignores candles).
//! - [`Decider`] + [`DeciderStrategy`]: plug bar-by-bar trading logic into barter's `Engine`.
//! - [`run_backtest`] / [`run_sweep`]: replay OHLCV bars through `barter::backtest::backtest`
//!   with barter's mock execution and return a serializable [`BacktestReport`].

pub mod backtest;
pub mod config;
pub mod data;
pub mod ledger;
pub mod report;
pub mod strategy;

pub use backtest::{run_backtest, run_sweep, BacktestError};
pub use config::BacktestConfig;
pub use data::{Bar, BarGate, CandleData, CandleMarketData};
pub use ledger::Ledger;
pub use report::{BacktestReport, InstrumentMetrics, SummaryMetrics, TradeRecord};
pub use strategy::{
    Action, ActionSide, BarContext, Decider, DeciderError, DeciderStrategy, HonbaEngineState,
    OrderType,
};
