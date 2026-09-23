use crate::types::{MarketSegment, OrderSide};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize)]
pub struct TradeCosts {
    pub brokerage: Decimal,
    pub stt: Decimal,
    pub exchange_fee: Decimal,
    pub sebi_fee: Decimal,
    pub stamp_duty: Decimal,
    pub gst: Decimal,
    pub total: Decimal,
}

pub struct IndianTaxCalculator;

impl IndianTaxCalculator {
    pub fn calculate(
        segment: MarketSegment,
        side: OrderSide,
        price: Decimal,
        quantity: u32,
    ) -> TradeCosts {
        let turnover = price * Decimal::from(quantity);
        let qty_dec = Decimal::from(quantity);
        let _ = qty_dec;

        // Brokerage: flat 20 or 0.03% (discount broker model)
        let brokerage = match segment {
            MarketSegment::EquityCash => Decimal::ZERO, // Delivery 0
            _ => (turnover * Decimal::new(3, 4)).min(Decimal::from(20)),
        };

        // STT (Budget 2024 revisions)
        let stt = match (segment, side) {
            (MarketSegment::EquityCash, _) => turnover * Decimal::new(1, 3), // 0.1% Buy & Sell
            (MarketSegment::EquityFutures, OrderSide::Sell) => turnover * Decimal::new(2, 4), // 0.02%
            (MarketSegment::EquityOptions, OrderSide::Sell) => turnover * Decimal::new(1, 3), // 0.1% on premium
            _ => Decimal::ZERO,
        };

        // Exchange turnover fee (NSE ~0.00297%)
        let exchange_fee = turnover * Decimal::new(297, 7);

        // SEBI turnover charge (0.0001%)
        let sebi_fee = turnover * Decimal::new(10, 7);

        // Stamp duty (Buy side only)
        let stamp_duty = if side == OrderSide::Buy {
            match segment {
                MarketSegment::EquityCash => turnover * Decimal::new(15, 5), // 0.015%
                MarketSegment::EquityFutures => turnover * Decimal::new(2, 5), // 0.002%
                MarketSegment::EquityOptions => turnover * Decimal::new(3, 5), // 0.003%
                _ => Decimal::ZERO,
            }
        } else {
            Decimal::ZERO
        };

        // GST: 18% on (Brokerage + Exchange fee + SEBI fee)
        let gst = (brokerage + exchange_fee + sebi_fee) * Decimal::new(18, 2);

        let total = brokerage + stt + exchange_fee + sebi_fee + stamp_duty + gst;

        TradeCosts {
            brokerage,
            stt,
            exchange_fee,
            sebi_fee,
            stamp_duty,
            gst,
            total,
        }
    }
}
