//! Execution log used as barter `GlobalData`.
//!
//! honba sends every fill it decides on to barter's mock exchange as a market order whose
//! `StrategyId` is the honba fill id. barter's mock exchange only tracks the quote balance and,
//! on a sell, debits it by the *base* quantity instead of crediting the sale proceeds, so its
//! balances are unusable for a cash-constrained backtest. It is therefore seeded with a
//! practically unlimited quote balance, and this log just records which fills barter executed
//! (from `Trade` events) or refused (from failed `OrderSnapshot`s). The
//! [`Book`](crate::book::Book) applies them to the real portfolio.

use barter::engine::Processor;
use barter_data::event::{DataKind, MarketEvent};
use barter_execution::{
    order::state::{InactiveOrderState, OrderState},
    AccountEvent, AccountEventKind,
};
use barter_instrument::instrument::InstrumentIndex;
use rust_decimal::prelude::ToPrimitive;

/// What barter did with one honba fill.
#[derive(Debug, Clone, PartialEq)]
pub enum ExecutionOutcome {
    Filled { price: f64, qty: f64 },
    Failed { reason: String },
}

/// One execution report from barter.
#[derive(Debug, Clone, PartialEq)]
pub struct ExecutionReport {
    /// honba fill id (the order's barter `StrategyId`).
    pub fill_id: String,
    pub outcome: ExecutionOutcome,
}

/// barter `GlobalData`: append-only log of execution reports.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Ledger {
    pub reports: Vec<ExecutionReport>,
}

impl Processor<&MarketEvent<InstrumentIndex, DataKind>> for Ledger {
    type Audit = ();

    fn process(&mut self, _: &MarketEvent<InstrumentIndex, DataKind>) -> Self::Audit {}
}

impl Processor<&AccountEvent> for Ledger {
    type Audit = ();

    fn process(&mut self, event: &AccountEvent) -> Self::Audit {
        match &event.kind {
            AccountEventKind::Trade(trade) => self.reports.push(ExecutionReport {
                fill_id: trade.strategy.0.to_string(),
                outcome: ExecutionOutcome::Filled {
                    price: trade.price.to_f64().unwrap_or(f64::NAN),
                    qty: trade.quantity.abs().to_f64().unwrap_or(f64::NAN),
                },
            }),
            AccountEventKind::OrderSnapshot(snapshot) => {
                let order = snapshot.value();
                if let OrderState::Inactive(InactiveOrderState::OpenFailed(error)) = &order.state {
                    self.reports.push(ExecutionReport {
                        fill_id: order.key.strategy.0.to_string(),
                        outcome: ExecutionOutcome::Failed {
                            reason: format!("exchange: {error}"),
                        },
                    });
                }
            }
            _ => {}
        }
    }
}
