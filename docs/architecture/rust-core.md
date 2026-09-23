# Rust Core Engine: Performance, Precision & Parallelism

## 1. Zero-Allocation Data Structures & Numerical Precision

To eliminate floating-point rounding errors common in quantitative systems, Honba enforces decimal precision throughout the Rust core:
- **`rust_decimal::Decimal`**: 128-bit fixed-point decimal arithmetic for financial prices, cash, and balances.
- **Tick Storage via Apache Arrow**: Historical ticks and 1-minute bars are stored in contiguous memory via Arrow columnar arrays, enabling SIMD vectorization.

---

## 2. SIMD Technical Indicator Engine

Indicators are computed in native Rust leveraging SIMD (Single Instruction, Multiple Data) processor extensions:
- **Moving Averages**: Exponential Moving Average (EMA), Simple Moving Average (SMA), Weighted Moving Average (WMA).
- **Volatility & Bands**: Average True Range (ATR), Bollinger Bands, Keltner Channels.
- **Momentum**: Relative Strength Index (RSI), MACD, Stochastic Oscillator, SuperTrend.
- **Fixed Income**: Newton-Raphson solver for Yield to Maturity (YTM), Macaulay duration, and convexity.

---

## 3. Parallel Backtesting Runner (Rayon)

Backtest hyperparameter sweeps and Combinatorial Purged Cross-Validation (CPCV) folds execute concurrently across all available CPU cores:

```rust
use rayon::prelude::*;

pub fn run_parallel_evaluations(
    parameter_grid: Vec<StrategyConfig>,
    dataset: &MarketDataset,
) -> Vec<EvaluationMetrics> {
    parameter_grid
        .par_iter()
        .map(|config| {
            let mut engine = BacktestEngine::new(config, dataset);
            engine.run_simulation()
        })
        .collect()
}
```
