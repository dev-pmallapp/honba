use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum MarketSegment {
    EquityCash,
    EquityFutures,
    EquityOptions,
    Commodity,
    Currency,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum OrderSide {
    Buy,
    Sell,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum OrderType {
    Market,
    Limit,
    StopLoss,
    StopLossLimit,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ProductType {
    /// Cash and Carry (Delivery)
    CNC,
    /// Margin Intraday Square-off
    MIS,
    /// Margin Trading Facility
    MTF,
    /// Normal (F&O overnight)
    NRML,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum TimeFrame {
    Minute1,
    Minute3,
    Minute5,
    Minute15,
    Hour1,
    Day1,
    Week1,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum Instrument {
    Equity {
        symbol: String,
        isin: String,
        lot_size: u32,
        tick_size: Decimal,
    },
    FactorIndex {
        symbol: String,
        index_code: String,
    },
    Etf {
        symbol: String,
        underlying: String,
    },
    MutualFund {
        amfi_code: String,
        scheme_name: String,
    },
    CorporateBond {
        isin: String,
        coupon_rate: Decimal,
    },
    Option {
        underlying: String,
        strike_price: Decimal,
        expiry: DateTime<Utc>,
        is_call: bool,
        lot_size: u32,
    },
}
