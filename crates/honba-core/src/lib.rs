//! Honba Core: High-performance execution pipeline, market types, and Indian tax engine.

pub mod event;
pub mod execution;
pub mod position;
pub mod risk;
pub mod tax;
pub mod types;

// Re-export common types
pub use event::{FillEvent, MarketEvent, OrderEvent, Signal};
pub use execution::ExecutionEngine;
pub use position::{PortfolioState, Position};
pub use risk::RiskGuard;
pub use tax::{IndianTaxCalculator, TradeCosts};
pub use types::{Instrument, OrderSide, OrderType, ProductType, TimeFrame};
