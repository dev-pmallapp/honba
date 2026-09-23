use crate::types::{OrderSide, ProductType};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Position {
    pub symbol: String,
    pub product: ProductType,
    pub quantity: i64,
    pub average_price: Decimal,
    pub realized_pnl: Decimal,
    pub unrealized_pnl: Decimal,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PortfolioState {
    pub cash_balance: Decimal,
    pub positions: HashMap<String, Position>,
    pub total_equity: Decimal,
}

impl Position {
    pub fn new(symbol: String, product: ProductType) -> Self {
        Self {
            symbol,
            product,
            quantity: 0,
            average_price: Decimal::ZERO,
            realized_pnl: Decimal::ZERO,
            unrealized_pnl: Decimal::ZERO,
        }
    }

    pub fn apply_fill(&mut self, side: OrderSide, qty: u32, price: Decimal) {
        let signed_qty = match side {
            OrderSide::Buy => qty as i64,
            OrderSide::Sell => -(qty as i64),
        };
        self.quantity += signed_qty;
        self.average_price = price;
    }
}
