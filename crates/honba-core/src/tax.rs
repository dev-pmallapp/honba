use crate::types::{MarketSegment, OrderSide, ProductType};
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
    /// Depository participant charge (delivery sells).
    #[serde(default)]
    pub dp: Decimal,
    pub total: Decimal,
}

/// Broker charges used by [`IndianTaxCalculator::calculate_for`].
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct BrokeragePlan {
    /// Cap per executed order (e.g. 20 for a discount broker).
    pub per_order: Decimal,
    /// Percent of turnover (e.g. 0.03 = 0.03%); the charge is `min(per_order, pct% x turnover)`.
    /// Zero means a flat `per_order` charge.
    pub pct: Decimal,
    /// Delivery (CNC) trades are brokerage free.
    pub cnc_free: bool,
    /// DP charge per delivery sell order (0 to ignore).
    pub dp_per_sell: Decimal,
}

impl Default for BrokeragePlan {
    fn default() -> Self {
        Self {
            per_order: Decimal::from(20),
            pct: Decimal::new(3, 2),
            cnc_free: true,
            dp_per_sell: Decimal::ZERO,
        }
    }
}

/// Statutory rates of one segment / product combination (fractions of turnover).
struct Rates {
    stt_buy: Decimal,
    stt_sell: Decimal,
    exchange: Decimal,
    stamp_buy: Decimal,
    delivery: bool,
    flat_brokerage: bool,
}

/// NSE rates effective 2024-10-01 (Budget 2024 STT revision, NSE transaction charges).
fn rates(segment: MarketSegment, product: ProductType) -> Rates {
    let pct = |mantissa: i64, scale: u32| Decimal::new(mantissa, scale + 2);
    match (segment, product) {
        (MarketSegment::EquityCash, ProductType::MIS) => Rates {
            stt_buy: Decimal::ZERO,
            stt_sell: pct(25, 3),  // 0.025%
            exchange: pct(297, 5), // 0.00297%
            stamp_buy: pct(3, 3),  // 0.003%
            delivery: false,
            flat_brokerage: false,
        },
        (MarketSegment::EquityCash, _) => Rates {
            stt_buy: pct(1, 1),    // 0.1%
            stt_sell: pct(1, 1),   // 0.1%
            exchange: pct(297, 5), // 0.00297%
            stamp_buy: pct(15, 3), // 0.015%
            delivery: true,
            flat_brokerage: false,
        },
        (MarketSegment::EquityFutures, _) => Rates {
            stt_buy: Decimal::ZERO,
            stt_sell: pct(2, 2),   // 0.02%
            exchange: pct(173, 5), // 0.00173%
            stamp_buy: pct(2, 3),  // 0.002%
            delivery: false,
            flat_brokerage: false,
        },
        (MarketSegment::EquityOptions, _) => Rates {
            stt_buy: Decimal::ZERO,
            stt_sell: pct(1, 1),    // 0.1% of premium
            exchange: pct(3503, 5), // 0.03503% of premium
            stamp_buy: pct(3, 3),   // 0.003%
            delivery: false,
            flat_brokerage: true,
        },
        (MarketSegment::Commodity, _) => Rates {
            stt_buy: Decimal::ZERO,
            stt_sell: pct(1, 2),  // CTT 0.01% (non-agri futures)
            exchange: pct(21, 4), // ~0.0021%
            stamp_buy: pct(2, 3), // 0.002%
            delivery: false,
            flat_brokerage: false,
        },
        (MarketSegment::Currency, _) => Rates {
            stt_buy: Decimal::ZERO,
            stt_sell: Decimal::ZERO,
            exchange: pct(35, 5), // ~0.00035%
            stamp_buy: pct(1, 4), // 0.0001%
            delivery: false,
            flat_brokerage: false,
        },
    }
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
            dp: Decimal::ZERO,
            total,
        }
    }

    /// Product-aware charges for one executed order.
    ///
    /// Unlike [`Self::calculate`], intraday (MIS) equity is charged STT on the sell side only
    /// at 0.025% and 0.003% stamp duty, exchange charges depend on the segment (options on
    /// premium), brokerage follows `plan`, and delivery sells can carry a DP charge.
    pub fn calculate_for(
        segment: MarketSegment,
        product: ProductType,
        side: OrderSide,
        price: Decimal,
        quantity: Decimal,
        plan: &BrokeragePlan,
    ) -> TradeCosts {
        let rates = rates(segment, product);
        let turnover = price * quantity.abs();

        let brokerage = if rates.delivery && plan.cnc_free {
            Decimal::ZERO
        } else if rates.flat_brokerage || plan.pct.is_zero() {
            plan.per_order
        } else {
            (turnover * plan.pct / Decimal::ONE_HUNDRED).min(plan.per_order)
        };
        let (stt, stamp_duty) = match side {
            OrderSide::Buy => (turnover * rates.stt_buy, turnover * rates.stamp_buy),
            OrderSide::Sell => (turnover * rates.stt_sell, Decimal::ZERO),
        };
        let exchange_fee = turnover * rates.exchange;
        let sebi_fee = turnover * Decimal::new(1, 6); // Rs 10 / crore
        let gst = (brokerage + exchange_fee + sebi_fee) * Decimal::new(18, 2);
        let dp = if rates.delivery && side == OrderSide::Sell {
            plan.dp_per_sell
        } else {
            Decimal::ZERO
        };
        let total = brokerage + stt + exchange_fee + sebi_fee + stamp_duty + gst + dp;

        TradeCosts {
            brokerage,
            stt,
            exchange_fee,
            sebi_fee,
            stamp_duty,
            gst,
            dp,
            total,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn d(value: &str) -> Decimal {
        value.parse().unwrap()
    }

    #[test]
    fn delivery_vs_intraday_equity() {
        let plan = BrokeragePlan::default();
        let price = d("1000");
        let qty = d("100"); // turnover 1,00,000

        let buy = IndianTaxCalculator::calculate_for(
            MarketSegment::EquityCash,
            ProductType::CNC,
            OrderSide::Buy,
            price,
            qty,
            &plan,
        );
        assert_eq!(buy.brokerage, Decimal::ZERO);
        assert_eq!(buy.stt, d("100")); // 0.1%
        assert_eq!(buy.stamp_duty, d("15")); // 0.015%
        assert_eq!(buy.exchange_fee, d("2.97"));
        assert_eq!(buy.sebi_fee, d("0.1"));
        assert_eq!(buy.gst, (d("2.97") + d("0.1")) * d("0.18"));

        let sell = IndianTaxCalculator::calculate_for(
            MarketSegment::EquityCash,
            ProductType::MIS,
            OrderSide::Sell,
            price,
            qty,
            &plan,
        );
        assert_eq!(sell.brokerage, d("20")); // min(20, 0.03% = 30)
        assert_eq!(sell.stt, d("25")); // 0.025% sell side
        assert_eq!(sell.stamp_duty, Decimal::ZERO);

        let mis_buy = IndianTaxCalculator::calculate_for(
            MarketSegment::EquityCash,
            ProductType::MIS,
            OrderSide::Buy,
            price,
            qty,
            &plan,
        );
        assert_eq!(mis_buy.stt, Decimal::ZERO);
        assert_eq!(mis_buy.stamp_duty, d("3")); // 0.003%
    }

    #[test]
    fn derivatives_and_dp() {
        let plan = BrokeragePlan {
            dp_per_sell: d("15.93"),
            ..BrokeragePlan::default()
        };
        let options = IndianTaxCalculator::calculate_for(
            MarketSegment::EquityOptions,
            ProductType::NRML,
            OrderSide::Sell,
            d("100"),
            d("75"),
            &plan,
        );
        assert_eq!(options.brokerage, d("20")); // flat per order
        assert_eq!(options.stt, d("7.5")); // 0.1% of premium turnover 7,500
        assert_eq!(options.dp, Decimal::ZERO);

        let futures = IndianTaxCalculator::calculate_for(
            MarketSegment::EquityFutures,
            ProductType::NRML,
            OrderSide::Sell,
            d("20000"),
            d("75"),
            &plan,
        );
        assert_eq!(futures.stt, d("300")); // 0.02% of 15,00,000
        assert_eq!(futures.brokerage, d("20"));

        let delivery_sell = IndianTaxCalculator::calculate_for(
            MarketSegment::EquityCash,
            ProductType::CNC,
            OrderSide::Sell,
            d("100"),
            d("10"),
            &plan,
        );
        assert_eq!(delivery_sell.dp, d("15.93"));
        assert_eq!(
            delivery_sell.total,
            delivery_sell.stt
                + delivery_sell.exchange_fee
                + delivery_sell.sebi_fee
                + delivery_sell.gst
                + delivery_sell.dp
        );
    }
}
