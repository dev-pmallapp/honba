//! Cash & position book-keeping used as barter `GlobalData`.
//!
//! barter's mock exchange only tracks the quote balance, and on a sell it debits the quote
//! balance by the *base* quantity instead of crediting the sale proceeds. Its balances are
//! therefore unusable for a cash-constrained backtest, so the mock exchange is seeded with a
//! practically unlimited quote balance and the real cash, positions, fills and equity curve are
//! derived here from the [`Trade`](barter_execution::trade::Trade) events it emits.

use barter::engine::Processor;
use barter_data::event::{DataKind, MarketEvent};
use barter_execution::{
    order::state::{InactiveOrderState, OrderState},
    AccountEvent, AccountEventKind,
};
use barter_instrument::{instrument::InstrumentIndex, Side};
use rust_decimal::{prelude::FromPrimitive, prelude::ToPrimitive, Decimal};
use std::collections::HashMap;

/// Net position in one instrument with average-cost accounting.
#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct LedgerPosition {
    /// Signed quantity: positive long, negative short.
    pub quantity: Decimal,
    pub avg_price: Decimal,
}

impl LedgerPosition {
    /// Apply a fill of signed quantity `delta` at `price`, returning the realised PnL (gross of
    /// fees) of any quantity it closed.
    fn apply(&mut self, delta: Decimal, price: Decimal) -> Decimal {
        let same_direction =
            self.quantity.is_zero() || self.quantity.is_sign_positive() == delta.is_sign_positive();

        if same_direction {
            let quantity_new = self.quantity + delta;
            self.avg_price =
                (self.quantity.abs() * self.avg_price + delta.abs() * price) / quantity_new.abs();
            self.quantity = quantity_new;
            return Decimal::ZERO;
        }

        let closed = delta.abs().min(self.quantity.abs());
        let direction = if self.quantity.is_sign_positive() {
            Decimal::ONE
        } else {
            -Decimal::ONE
        };
        let realised = closed * (price - self.avg_price) * direction;

        let quantity_new = self.quantity + delta;
        if quantity_new.is_zero() {
            self.avg_price = Decimal::ZERO;
        } else if quantity_new.is_sign_positive() != self.quantity.is_sign_positive() {
            // Flipped through flat: remaining quantity was opened at this price
            self.avg_price = price;
        }
        self.quantity = quantity_new;

        realised
    }
}

/// A fill as recorded by the [`Ledger`].
#[derive(Debug, Clone, PartialEq)]
pub struct LedgerTrade {
    /// Timestamp (epoch ms) of the bar the order was decided on.
    pub time_ms: i64,
    pub instrument: InstrumentIndex,
    pub side: Side,
    pub quantity: Decimal,
    pub price: Decimal,
    pub fees: Decimal,
    /// Realised PnL (gross of fees) of any quantity this fill closed.
    pub realised_pnl: Decimal,
}

/// An order the mock exchange refused to open.
#[derive(Debug, Clone, PartialEq)]
pub struct LedgerOrderFailure {
    pub time_ms: i64,
    pub instrument: InstrumentIndex,
    pub side: Side,
    pub quantity: Decimal,
    pub reason: String,
}

/// barter `GlobalData` tracking cash, positions, fills and the mark-to-market equity curve.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Ledger {
    pub initial_cash: Decimal,
    pub cash: Decimal,
    pub fees_paid: Decimal,
    pub positions: HashMap<InstrumentIndex, LedgerPosition>,
    pub last_close: HashMap<InstrumentIndex, Decimal>,
    pub trades: Vec<LedgerTrade>,
    pub order_failures: Vec<LedgerOrderFailure>,
    /// `(epoch ms, equity)`, one point per bar timestamp.
    pub equity_curve: Vec<(i64, f64)>,
    /// Number of open requests that have been resolved (filled or failed).
    pub orders_resolved: usize,
    pub last_bar_ms: i64,
}

impl Ledger {
    pub fn new(initial_cash: Decimal) -> Self {
        Self {
            initial_cash,
            cash: initial_cash,
            ..Self::default()
        }
    }

    /// Signed position quantity of an instrument.
    pub fn position(&self, instrument: &InstrumentIndex) -> Decimal {
        self.positions
            .get(instrument)
            .map(|position| position.quantity)
            .unwrap_or_default()
    }

    /// Cash plus the mark-to-market value of every position at its last close.
    pub fn equity(&self) -> Decimal {
        self.positions
            .iter()
            .fold(self.cash, |equity, (instrument, position)| {
                let price = self
                    .last_close
                    .get(instrument)
                    .copied()
                    .unwrap_or(position.avg_price);
                equity + position.quantity * price
            })
    }

    fn mark_to_market(&mut self) {
        let point = (self.last_bar_ms, self.equity().to_f64().unwrap_or(f64::NAN));
        match self.equity_curve.last_mut() {
            Some(last) if last.0 == point.0 => *last = point,
            _ => self.equity_curve.push(point),
        }
    }
}

impl Processor<&MarketEvent<InstrumentIndex, DataKind>> for Ledger {
    type Audit = ();

    fn process(&mut self, event: &MarketEvent<InstrumentIndex, DataKind>) -> Self::Audit {
        let DataKind::Candle(candle) = &event.kind else {
            return;
        };
        let Some(close) = Decimal::from_f64(candle.close) else {
            return;
        };

        self.last_close.insert(event.instrument, close);
        self.last_bar_ms = self.last_bar_ms.max(event.time_exchange.timestamp_millis());
        self.mark_to_market();
    }
}

impl Processor<&AccountEvent> for Ledger {
    type Audit = ();

    fn process(&mut self, event: &AccountEvent) -> Self::Audit {
        match &event.kind {
            AccountEventKind::Trade(trade) => {
                let delta = match trade.side {
                    Side::Buy => trade.quantity.abs(),
                    Side::Sell => -trade.quantity.abs(),
                };
                let fees = trade.fees.fees;

                self.cash -= delta * trade.price + fees;
                self.fees_paid += fees;
                let realised_pnl = self
                    .positions
                    .entry(trade.instrument)
                    .or_default()
                    .apply(delta, trade.price);

                self.trades.push(LedgerTrade {
                    time_ms: self.last_bar_ms,
                    instrument: trade.instrument,
                    side: trade.side,
                    quantity: trade.quantity.abs(),
                    price: trade.price,
                    fees,
                    realised_pnl,
                });
                self.orders_resolved += 1;
                self.mark_to_market();
            }
            AccountEventKind::OrderSnapshot(snapshot) => {
                let order = snapshot.value();
                if let OrderState::Inactive(InactiveOrderState::OpenFailed(error)) = &order.state {
                    self.order_failures.push(LedgerOrderFailure {
                        time_ms: self.last_bar_ms,
                        instrument: order.key.instrument,
                        side: order.side,
                        quantity: order.quantity,
                        reason: error.to_string(),
                    });
                    self.orders_resolved += 1;
                }
            }
            _ => {}
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rust_decimal::dec;

    #[test]
    fn position_average_cost_and_realised_pnl() {
        let mut position = LedgerPosition::default();
        assert_eq!(position.apply(dec!(10), dec!(100)), dec!(0));
        assert_eq!(position.apply(dec!(10), dec!(110)), dec!(0));
        assert_eq!(position.avg_price, dec!(105));

        // Close half at 120: 10 * (120 - 105)
        assert_eq!(position.apply(dec!(-10), dec!(120)), dec!(150));
        assert_eq!(position.quantity, dec!(10));

        // Sell 15 at 100 closes 10 (-50) and flips short 5 @ 100
        assert_eq!(position.apply(dec!(-15), dec!(100)), dec!(-50));
        assert_eq!(position.quantity, dec!(-5));
        assert_eq!(position.avg_price, dec!(100));

        // Cover the short at 90: 5 * (90 - 100) * -1
        assert_eq!(position.apply(dec!(5), dec!(90)), dec!(50));
        assert_eq!(position.quantity, dec!(0));
    }
}
