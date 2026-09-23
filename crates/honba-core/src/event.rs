use crate::tax::TradeCosts;
use crate::types::{OrderSide, OrderType, ProductType};
use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum MarketEvent {
    Tick {
        symbol: String,
        timestamp: DateTime<Utc>,
        price: Decimal,
        volume: u64,
    },
    Candle {
        symbol: String,
        timestamp: DateTime<Utc>,
        open: Decimal,
        high: Decimal,
        low: Decimal,
        close: Decimal,
        volume: u64,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Signal {
    pub symbol: String,
    pub timestamp: DateTime<Utc>,
    pub side: OrderSide,
    pub strength: Decimal,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrderEvent {
    pub order_id: String,
    pub symbol: String,
    pub side: OrderSide,
    pub order_type: OrderType,
    pub product: ProductType,
    pub quantity: u32,
    pub price: Option<Decimal>,
    pub trigger_price: Option<Decimal>,
    pub timestamp: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FillEvent {
    pub order_id: String,
    pub symbol: String,
    pub side: OrderSide,
    pub filled_quantity: u32,
    pub fill_price: Decimal,
    pub timestamp: DateTime<Utc>,
    pub costs: TradeCosts,
}
