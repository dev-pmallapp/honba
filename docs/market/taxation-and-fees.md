# Indian Regulatory Taxation, Brokerage & Fee Matrix

## 1. Indian Regulatory Cost Breakdown

A quantitative strategy in India can show substantial gross profits while experiencing severe drawdowns net of regulatory taxes, particularly for high-turnover intraday or multi-leg options trading.

| Fee Component | Equity Delivery (CNC) | Equity Intraday (MIS) | Equity Futures | Equity Options |
| :--- | :--- | :--- | :--- | :--- |
| **Brokerage** | Typically ₹0 (discount) or ₹20/order | Flat ₹20 or 0.03% (whichever is lower) | Flat ₹20 or 0.03% | Flat ₹20 per executed order |
| **STT (Securities Transaction Tax)** | 0.1% on Buy & Sell | 0.025% on Sell only | 0.02% on Sell only *(Budget 2024)* | 0.1% on Sell turnover (Premium) *(Budget 2024)* |
| **Exchange Turnover Charges** | NSE: 0.00297%, BSE: 0.00375% | NSE: 0.00297% | NSE: 0.00173% | NSE: 0.03503% (on premium) |
| **GST** | 18% on (Brokerage + Exchange Charges + SEBI Charges) | 18% on charges | 18% on charges | 18% on charges |
| **SEBI Turnover Charges** | ₹10 per crore (0.0001%) | ₹10 per crore | ₹10 per crore | ₹10 per crore |
| **Stamp Duty** | 0.015% (Buy side only) | 0.003% (Buy side only) | 0.002% (Buy side only) | 0.003% (Buy side only) |
| **DP Charges (Demat)** | ₹13.50 + GST per company per day (Sell side only) | ₹0 | ₹0 | ₹0 |

---

## 2. Calculation Logic in Rust Engine

```rust
pub struct IndianTaxCalculator;

impl IndianTaxCalculator {
    pub fn calculate_trade_costs(
        segment: MarketSegment,
        side: OrderSide,
        price: Decimal,
        quantity: u32,
    ) -> TradeCosts {
        let turnover = price * Decimal::from(quantity);
        let brokerage = calculate_brokerage(turnover);
        let stt = calculate_stt(segment, side, turnover);
        let exchange_fee = calculate_exchange_fee(segment, turnover);
        let sebi_fee = turnover * Decimal::new(10, 7); // 0.0001%
        let stamp_duty = if side == OrderSide::Buy {
            calculate_stamp_duty(segment, turnover)
        } else {
            Decimal::ZERO
        };
        let gst = (brokerage + exchange_fee + sebi_fee) * Decimal::new(18, 2); // 18%

        TradeCosts {
            brokerage,
            stt,
            exchange_fee,
            sebi_fee,
            stamp_duty,
            gst,
            total: brokerage + stt + exchange_fee + sebi_fee + stamp_duty + gst,
        }
    }
}
```
