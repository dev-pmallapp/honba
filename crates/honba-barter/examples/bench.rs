//! Rough throughput check: `cargo run --release -p honba-barter --example bench`.
use honba_barter::{
    run_backtest, Action, ActionSide, BacktestConfig, Bar, BarContext, DeciderError, OrderRequest,
    TrailMode, TrailSpec,
};
use std::{collections::BTreeMap, sync::Arc, time::Instant};

fn main() {
    let (symbols, bars_per_symbol) = (20usize, 5_000usize);
    let candles = (0..symbols)
        .map(|s| {
            let bars = (0..bars_per_symbol)
                .map(|i| {
                    let x = i as f64;
                    let c = 100.0 + 10.0 * (x / (7.0 + s as f64)).sin() + 0.01 * x;
                    Bar::new(
                        1_704_067_200_000 + i as i64 * 60_000,
                        c,
                        c + 1.0,
                        c - 1.0,
                        c,
                        1.0,
                    )
                })
                .collect();
            (format!("S{s}"), bars)
        })
        .collect::<BTreeMap<_, _>>();
    let decider = Arc::new(
        |ctx: &BarContext<'_>| -> Result<Vec<Action>, DeciderError> {
            let mut actions = Vec::new();
            for (symbol, history) in &ctx.history {
                let n = history.len();
                if n < 20 {
                    continue;
                }
                let fast = history[n - 5..].iter().map(|b| b.close).sum::<f64>() / 5.0;
                let slow = history[n - 20..].iter().map(|b| b.close).sum::<f64>() / 20.0;
                if fast > slow && ctx.qty(symbol) == 0.0 {
                    actions.push(
                        OrderRequest::market(symbol.clone(), ActionSide::Buy, 10.0)
                            .take_profit(history[n - 1].close * 1.05)
                            .trail(TrailSpec {
                                mode: TrailMode::Percent,
                                value: 2.0,
                                atr_period: None,
                                activation_price: None,
                                step: None,
                            })
                            .into(),
                    );
                }
            }
            Ok(actions)
        },
    );
    let config = BacktestConfig {
        initial_cash: 10_000_000.0,
        ..BacktestConfig::default()
    };
    let started = Instant::now();
    let report = run_backtest(config, candles, decider).unwrap();
    println!(
        "{} bars x {} symbols: {} fills, {} orders in {:?}",
        bars_per_symbol,
        symbols,
        report.trades.len(),
        report.orders.len(),
        started.elapsed()
    );
}
