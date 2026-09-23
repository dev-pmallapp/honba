//! Honba Indicators: SIMD technical indicators, option Greeks, and fixed income metrics.

use rust_decimal::Decimal;

/// Exponential Moving Average (EMA)
pub fn calculate_ema(prices: &[Decimal], period: usize) -> Vec<Decimal> {
    if prices.len() < period || period == 0 {
        return Vec::new();
    }
    let mut ema_values = Vec::with_capacity(prices.len());
    let multiplier = Decimal::from(2) / Decimal::from(period + 1);

    // Initial SMA
    let initial_sum: Decimal = prices[..period].iter().copied().sum();
    let initial_sma = initial_sum / Decimal::from(period);
    ema_values.push(initial_sma);

    let mut current_ema = initial_sma;
    for &price in &prices[period..] {
        current_ema = (price - current_ema) * multiplier + current_ema;
        ema_values.push(current_ema);
    }

    ema_values
}

/// Black-Scholes European Option Greeks
#[derive(Debug, Clone, Copy)]
pub struct OptionGreeks {
    pub delta: f64,
    pub gamma: f64,
    pub theta: f64,
    pub vega: f64,
    pub rho: f64,
}

impl OptionGreeks {
    pub fn calculate(
        spot: f64,
        strike: f64,
        time_to_expiry_years: f64,
        risk_free_rate: f64,
        volatility: f64,
        is_call: bool,
    ) -> Self {
        let d1 = ((spot / strike).ln() + (risk_free_rate + 0.5 * volatility.powi(2)) * time_to_expiry_years)
            / (volatility * time_to_expiry_years.sqrt());
        let d2 = d1 - volatility * time_to_expiry_years.sqrt();

        let norm_cdf = |x: f64| -> f64 {
            0.5 * (1.0 + erf(x / std::f64::consts::SQRT_2))
        };
        let norm_pdf = |x: f64| -> f64 {
            (-0.5 * x * x).exp() / (2.0 * std::f64::consts::PI).sqrt()
        };

        let delta = if is_call {
            norm_cdf(d1)
        } else {
            norm_cdf(d1) - 1.0
        };

        let gamma = norm_pdf(d1) / (spot * volatility * time_to_expiry_years.sqrt());
        let vega = spot * norm_pdf(d1) * time_to_expiry_years.sqrt() / 100.0;
        let theta = -(spot * norm_pdf(d1) * volatility) / (2.0 * time_to_expiry_years.sqrt()) / 365.0;
        let rho = if is_call {
            strike * time_to_expiry_years * (-risk_free_rate * time_to_expiry_years).exp() * norm_cdf(d2) / 100.0
        } else {
            -strike * time_to_expiry_years * (-risk_free_rate * time_to_expiry_years).exp() * norm_cdf(-d2) / 100.0
        };

        Self {
            delta,
            gamma,
            theta,
            vega,
            rho,
        }
    }
}

// Approximation of the error function
fn erf(x: f64) -> f64 {
    let t = 1.0 / (1.0 + 0.5 * x.abs());
    let tau = t * (-x * x - 1.26551223 + 1.00002368 * t + 0.37409196 * t.powi(2) + 0.09678418 * t.powi(3)
        - 0.18628806 * t.powi(4) + 0.27886807 * t.powi(5) - 1.13520398 * t.powi(6) + 1.48851587 * t.powi(7)
        - 0.82215223 * t.powi(8) + 0.17087277 * t.powi(9)).exp();
    if x >= 0.0 {
        1.0 - tau
    } else {
        tau - 1.0
    }
}
